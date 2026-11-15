import { DurableObject } from "cloudflare:workers";
import { buildPushPayload } from "@block65/webcrypto-web-push";

const KSU = { lat: 63.1118, lon: 7.8245, radiusNm: 150 };
const TRACK_KEEP_MS = 20 * 60 * 1000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function keyFor(a) {
  return String(a?.hex || a?.r || a?.flight || "").trim().toLowerCase();
}

function distanceNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const toRad = (d) => d * Math.PI / 180;
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);
  const h = Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function aircraftLabel(a) {
  return String(a?.flight || a?.r || a?.hex || "Ukjent fly").trim().toUpperCase();
}

function mergeAircraft(primary, secondary) {
  const byKey = new Map();

  const add = (a, source) => {
    const key = keyFor(a);
    if (!key) return;

    const copy = { ...a, _source: source };
    if (!byKey.has(key)) {
      byKey.set(key, copy);
      return;
    }

    const old = byKey.get(key);
    byKey.set(key, {
      ...copy,
      ...old,
      _source:
        old._source === source
          ? source
          : [old._source, source].filter(Boolean).join(" + "),
    });
  };

  primary.forEach((a) => add(a, "adsb.lol"));
  secondary.forEach((a) => add(a, "airplanes.live"));
  return [...byKey.values()];
}

export class TrackStore extends DurableObject {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/update") {
      const payload = await request.json();
      const ac = Array.isArray(payload?.ac) ? payload.ac : [];
      const now = Date.now();
      const tracks = (await this.ctx.storage.get("tracks")) || {};

      for (const a of ac) {
        const key = keyFor(a);
        const lat = Number(a?.lat);
        const lon = Number(a?.lon);
        if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const arr = Array.isArray(tracks[key]) ? tracks[key] : [];
        const last = arr[arr.length - 1];
        const moved =
          !last ||
          Math.abs(last.lat - lat) > 0.0005 ||
          Math.abs(last.lon - lon) > 0.0005;
        const oldEnough = !last || now - last.t >= 12000;

        if (!last || (moved && oldEnough)) {
          arr.push({ lat, lon, t: now });
        }

        tracks[key] = arr.filter((p) => now - p.t <= TRACK_KEEP_MS);
      }

      for (const key of Object.keys(tracks)) {
        const fresh = tracks[key].filter((p) => now - p.t <= TRACK_KEEP_MS);
        if (fresh.length) tracks[key] = fresh;
        else delete tracks[key];
      }

      await this.ctx.storage.put("tracks", tracks);

      return new Response(JSON.stringify({ ok: true, tracks }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (request.method === "GET" && url.pathname === "/tracks") {
      const tracks = (await this.ctx.storage.get("tracks")) || {};
      return new Response(JSON.stringify({ ok: true, tracks }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (request.method === "POST" && url.pathname === "/subscriptions") {
      const subscription = await request.json();
      if (!subscription?.endpoint) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid subscription" }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
      const subscriptions = (await this.ctx.storage.get("subscriptions")) || {};
      subscriptions[subscription.endpoint] = {
        subscription,
        updated_at: Date.now(),
      };
      await this.ctx.storage.put("subscriptions", subscriptions);
      return new Response(JSON.stringify({ ok: true, count: Object.keys(subscriptions).length }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (request.method === "GET" && url.pathname === "/subscriptions/status") {
      const subscriptions = (await this.ctx.storage.get("subscriptions")) || {};
      return new Response(JSON.stringify({ ok: true, count: Object.keys(subscriptions).length }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (request.method === "GET" && url.pathname === "/subscriptions") {
      const subscriptions = (await this.ctx.storage.get("subscriptions")) || {};
      return new Response(JSON.stringify({
        ok: true,
        subscriptions: Object.values(subscriptions).map((x) => x.subscription),
      }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (request.method === "DELETE" && url.pathname === "/subscriptions") {
      const endpoint = url.searchParams.get("endpoint") || "";
      const subscriptions = (await this.ctx.storage.get("subscriptions")) || {};
      if (endpoint && subscriptions[endpoint]) {
        delete subscriptions[endpoint];
        await this.ctx.storage.put("subscriptions", subscriptions);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (request.method === "POST" && url.pathname === "/push-state") {
      const payload = await request.json();
      const current = Array.isArray(payload?.inside) ? payload.inside : [];
      const previous = (await this.ctx.storage.get("inside50")) || [];
      const previousSet = new Set(previous);
      const entered = current.filter((key) => !previousSet.has(key));
      await this.ctx.storage.put("inside50", current);
      return new Response(JSON.stringify({ ok: true, entered }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  }
}

async function getSource(name, url) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Flyradar-KSU/1.0" },
      cf: {
        cacheEverything: true,
        cacheTtl: 15,
      },
    });

    if (!response.ok) {
      return { name, ok: false, status: response.status, ac: [] };
    }

    const json = await response.json();
    return {
      name,
      ok: true,
      status: response.status,
      ac: Array.isArray(json?.ac) ? json.ac : [],
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      ac: [],
    };
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    const isPushSubscribe = url.pathname === "/push/subscribe" && request.method === "POST";
    if (request.method !== "GET" && !isPushSubscribe) {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: corsHeaders() }
      );
    }

    if (url.pathname === "/route") {
      const callsign = (url.searchParams.get("callsign") || "").trim().toUpperCase();
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));

      if (!callsign) {
        return new Response(JSON.stringify({ error: "Missing callsign" }), {
          status: 400,
          headers: corsHeaders(),
        });
      }

      try {
        const body = {
          planes: [{
            callsign,
            ...(Number.isFinite(lat) ? { lat } : {}),
            ...(Number.isFinite(lon) ? { lng: lon } : {}),
          }],
        };

        const r = await fetch("https://api.adsb.lol/api/0/routeset", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Flyradar-KSU/1.0",
          },
          body: JSON.stringify(body),
        });

        if (!r.ok) {
          return new Response(JSON.stringify({ error: "Route lookup failed", status: r.status }), {
            status: 502,
            headers: { ...corsHeaders(), "Cache-Control": "no-store" },
          });
        }

        const rows = await r.json();
        const route = Array.isArray(rows) ? (rows[0] || null) : null;
        return new Response(JSON.stringify({ ok: true, callsign, route }), {
          status: 200,
          headers: { ...corsHeaders(), "Cache-Control": "public, max-age=300" },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "Route lookup error" }), {
          status: 502,
          headers: { ...corsHeaders(), "Cache-Control": "no-store" },
        });
      }
    }

    if (url.pathname === "/push/public-key") {
      if (!env.VAPID_PUBLIC_KEY) {
        return new Response(JSON.stringify({ ok: false, enabled: false }), {
          status: 503,
          headers: { ...corsHeaders(), "Cache-Control": "no-store" },
        });
      }
      return new Response(JSON.stringify({ ok: true, enabled: true, publicKey: env.VAPID_PUBLIC_KEY }), {
        status: 200,
        headers: { ...corsHeaders(), "Cache-Control": "no-store" },
      });
    }

    if (url.pathname === "/push/subscribe" && request.method === "POST") {
      try {
        const subscription = await request.json();
        const id = env.TRACK_STORE.idFromName("ksu");
        const stub = env.TRACK_STORE.get(id);
        const r = await stub.fetch("https://track-store/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription),
        });
        const body = await r.text();
        return new Response(body, {
          status: r.status,
          headers: { ...corsHeaders(), "Cache-Control": "no-store" },
        });
      } catch (error) {
        return new Response(JSON.stringify({ ok: false, error: "Subscription failed" }), {
          status: 500,
          headers: { ...corsHeaders(), "Cache-Control": "no-store" },
        });
      }
    }

    if (url.pathname === "/push/status") {
      try {
        const id = env.TRACK_STORE.idFromName("ksu");
        const stub = env.TRACK_STORE.get(id);
        const r = await stub.fetch("https://track-store/subscriptions/status");
        const data = await r.json();
        return new Response(JSON.stringify({
          ok: true,
          enabled: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT),
          subscriptions: data?.count || 0,
        }), {
          headers: { ...corsHeaders(), "Cache-Control": "no-store" },
        });
      } catch (error) {
        return new Response(JSON.stringify({ ok: false }), {
          status: 500,
          headers: { ...corsHeaders(), "Cache-Control": "no-store" },
        });
      }
    }

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "flyradar-ksu-worker",
          location: "KSU",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders(),
            "Cache-Control": "no-store",
          },
        }
      );
    }

    if (url.pathname !== "/" && url.pathname !== "/aircraft") {
      return new Response(
        JSON.stringify({ error: "Not found" }),
        { status: 404, headers: corsHeaders() }
      );
    }

    const adsbUrl =
      `https://api.adsb.lol/v2/point/${KSU.lat}/${KSU.lon}/${KSU.radiusNm}`;
    const airplanesUrl =
      `https://api.airplanes.live/v2/point/${KSU.lat}/${KSU.lon}/${KSU.radiusNm}`;

    const [adsb, airplanes] = await Promise.all([
      getSource("adsb.lol", adsbUrl),
      getSource("airplanes.live", airplanesUrl),
    ]);

    if (!adsb.ok && !airplanes.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "All aircraft sources failed",
          sources: {
            "adsb.lol": { ok: adsb.ok, status: adsb.status },
            "airplanes.live": { ok: airplanes.ok, status: airplanes.status },
          },
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders(),
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const ac = mergeAircraft(adsb.ac, airplanes.ac);

    let tracks = {};
    try {
      const id = env.TRACK_STORE.idFromName("ksu");
      const stub = env.TRACK_STORE.get(id);
      const trackResponse = await stub.fetch("https://track-store/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ac }),
      });
      if (trackResponse.ok) {
        const trackJson = await trackResponse.json();
        tracks = trackJson?.tracks || {};
      }
    } catch (error) {
      tracks = {};
    }

    return new Response(
      JSON.stringify({
        ok: true,
        generated_at: new Date().toISOString(),
        center: KSU,
        count: ac.length,
        tracks,
        sources: {
          "adsb.lol": {
            ok: adsb.ok,
            status: adsb.status,
            count: adsb.ac.length,
          },
          "airplanes.live": {
            ok: airplanes.ok,
            status: airplanes.status,
            count: airplanes.ac.length,
          },
        },
        ac,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders(),
          "Cache-Control": "public, max-age=10, s-maxage=15",
        },
      }
    );
  },

  async scheduled(controller, env, ctx) {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return;

    ctx.waitUntil((async () => {
      const adsbUrl =
        `https://api.adsb.lol/v2/point/${KSU.lat}/${KSU.lon}/${KSU.radiusNm}`;
      const airplanesUrl =
        `https://api.airplanes.live/v2/point/${KSU.lat}/${KSU.lon}/${KSU.radiusNm}`;

      const [adsb, airplanes] = await Promise.all([
        getSource("adsb.lol", adsbUrl),
        getSource("airplanes.live", airplanesUrl),
      ]);
      if (!adsb.ok && !airplanes.ok) return;

      const ac = mergeAircraft(adsb.ac, airplanes.ac);
      const inside = ac.filter((a) => {
        const lat = Number(a?.lat);
        const lon = Number(a?.lon);
        return Number.isFinite(lat) && Number.isFinite(lon) &&
          distanceNm(KSU.lat, KSU.lon, lat, lon) <= 50;
      });

      const byKey = new Map(inside.map((a) => [keyFor(a), a]));
      const id = env.TRACK_STORE.idFromName("ksu");
      const stub = env.TRACK_STORE.get(id);

      const stateResponse = await stub.fetch("https://track-store/push-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inside: [...byKey.keys()] }),
      });
      if (!stateResponse.ok) return;
      const state = await stateResponse.json();
      const entered = Array.isArray(state?.entered) ? state.entered : [];
      if (!entered.length) return;

      const subResponse = await stub.fetch("https://track-store/subscriptions");
      if (!subResponse.ok) return;
      const subData = await subResponse.json();
      const subscriptions = Array.isArray(subData?.subscriptions) ? subData.subscriptions : [];
      if (!subscriptions.length) return;

      const vapid = {
        subject: env.VAPID_SUBJECT,
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      };

      for (const key of entered) {
        const a = byKey.get(key);
        if (!a) continue;
        const d = distanceNm(KSU.lat, KSU.lon, Number(a.lat), Number(a.lon));
        const alt = Number(a.alt_baro ?? a.alt_geom);
        const body = Number.isFinite(alt)
          ? `${aircraftLabel(a)} er ${d.toFixed(1)} NM fra KSU · ${Math.round(alt).toLocaleString("no-NO")} ft`
          : `${aircraftLabel(a)} er ${d.toFixed(1)} NM fra KSU`;

        const message = {
          data: JSON.stringify({
            title: "Fly innen 50 NM",
            body,
            tag: `flyradar-${key}`,
            url: "https://vidarskoglund-cloud.github.io/flyradar-ksu/",
          }),
          options: { ttl: 120 },
        };

        for (const subscription of subscriptions) {
          try {
            const payload = await buildPushPayload(message, subscription, vapid);
            const response = await fetch(subscription.endpoint, payload);
            if (response.status === 404 || response.status === 410) {
              await stub.fetch(
                "https://track-store/subscriptions?endpoint=" +
                  encodeURIComponent(subscription.endpoint),
                { method: "DELETE" }
              );
            }
          } catch (error) {}
        }
      }
    })());
  }
};
