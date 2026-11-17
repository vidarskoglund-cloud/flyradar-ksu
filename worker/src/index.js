import { DurableObject } from "cloudflare:workers";
import { buildPushPayload } from "@block65/webcrypto-web-push";

const KSU = { lat: 63.1118, lon: 7.8245, radiusNm: 150 };
const TRACK_KEEP_MS = 20 * 60 * 1000;
const FLIGHTAWARE_QUERY_COST_USD = 0.005;
const FLIGHTAWARE_MONTHLY_BUDGET_USD = 4.50;
const FLIGHTAWARE_USAGE_CACHE_MS = 10 * 60 * 1000;

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
function vesselNumber(v, keys) {
  for (const key of keys) {
    const n = Number(v?.[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function vesselText(v, keys) {
  for (const key of keys) {
    const x = v?.[key];
    if (x !== undefined && x !== null && String(x).trim()) return String(x).trim();
  }
  return "";
}

function normalizeVesselFeature(feature) {
  const p = feature?.properties || feature || {};
  const coords = feature?.geometry?.coordinates || [];
  const lon = vesselNumber(p, ["longitude","lon","lng","x"]) ?? Number(coords?.[0]);
  const lat = vesselNumber(p, ["latitude","lat","y"]) ?? Number(coords?.[1]);
  const shipType = vesselNumber(p, ["shipType","ship_type","shiptype","type"]);
  const mmsi = vesselText(p, ["mmsi","MMSI"]);
  const name = vesselText(p, ["name","shipName","ship_name","vesselName","vessel_name"]);
  const speed = vesselNumber(p, ["speedOverGround","sog","speed","speed_over_ground"]);
  const course = vesselNumber(p, ["courseOverGround","cog","course","course_over_ground"]);
  const heading = vesselNumber(p, ["trueHeading","heading","true_heading"]);
  const destination = vesselText(p, ["destination","dest"]);
  const msgtime = vesselText(p, ["msgtime","timestamp","time","date_time_utc"]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, shipType, mmsi, name, speed, course, heading, destination, msgtime };
}

function relevantPassengerVessel(v) {
  const t = Number(v?.shipType);
  if (Number.isFinite(t) && ((t >= 40 && t <= 49) || (t >= 60 && t <= 69))) return true;
  const name = String(v?.name || "").toUpperCase();
  return /(HAVILA|HURTIGRUTEN|NORDLYS|POLARLYS|KONG HARALD|NORDKAPP|RICHARD WITH|MIDNATSOL|FINNMARKEN|TROLLFJORD)/.test(name);
}


function mergeAircraft(...sources) {
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
    const names = new Set(
      String(old._source || "")
        .split(" + ")
        .filter(Boolean)
        .concat(source)
    );
    byKey.set(key, {
      ...copy,
      ...old,
      _source: [...names].join(" + "),
    });
  };

  for (const source of sources) {
    for (const a of source.ac || []) add(a, source.name);
  }
  return [...byKey.values()];
}

export class TrackStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.aircraftFetchPromise = null;
  }

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/aircraft-shared") {
      const now = Date.now();
      const cached = (await this.ctx.storage.get("aircraftSharedSnapshot")) || null;
      if (cached && Number.isFinite(Number(cached.generated_at_ms)) &&
          now - Number(cached.generated_at_ms) < 60000) {
        return new Response(JSON.stringify({ ...cached, cache: "hit" }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }

      if (!this.aircraftFetchPromise) {
        this.aircraftFetchPromise = (async () => {
          const adsbUrl =
            `https://api.adsb.lol/v2/point/${KSU.lat}/${KSU.lon}/${KSU.radiusNm}`;
          const airplanesUrl =
            `https://api.airplanes.live/v2/point/${KSU.lat}/${KSU.lon}/${KSU.radiusNm}`;
          const adsbFiUrl =
            `https://opendata.adsb.fi/api/v3/lat/${KSU.lat}/lon/${KSU.lon}/dist/${KSU.radiusNm}`;

          // Respect provider rate limits across requests and scheduled jobs.
          const cooldown = (await this.ctx.storage.get("aircraftSourceCooldown")) || {};
          const providers = [
            ["adsb.lol", adsbUrl],
            ["airplanes.live", airplanesUrl],
            ["adsb.fi", adsbFiUrl],
          ];
          const results = {};
          for (const [name, sourceUrl] of providers) {
            const blockedUntil = Number(cooldown[name] || 0);
            if (blockedUntil > Date.now()) {
              results[name] = { name, ok: false, status: 429, ac: [], retry_at: blockedUntil };
              continue;
            }
            const result = await getSource(name, sourceUrl);
            results[name] = result;
            if (!result.ok) {
              cooldown[name] = Date.now() + (result.status === 403 ? 15 * 60000 :
                result.status === 429 ? 5 * 60000 : 2 * 60000);
            } else {
              delete cooldown[name];
              break; // One working source is enough; avoid unnecessary requests.
            }
          }
          await this.ctx.storage.put("aircraftSourceCooldown", cooldown);
          const adsb = results["adsb.lol"] || { name:"adsb.lol", ok:false, status:0, ac:[] };
          const airplanes = results["airplanes.live"] || { name:"airplanes.live", ok:false, status:0, ac:[] };
          const adsbfi = results["adsb.fi"] || { name:"adsb.fi", ok:false, status:0, ac:[] };

          const snapshot = {
            ok: Boolean(adsb.ok || airplanes.ok || adsbfi.ok),
            generated_at: new Date().toISOString(),
            generated_at_ms: Date.now(),
            sources: {
              "adsb.lol": { ok: adsb.ok, status: adsb.status, count: adsb.ac.length },
              "airplanes.live": { ok: airplanes.ok, status: airplanes.status, count: airplanes.ac.length },
              "adsb.fi": { ok: adsbfi.ok, status: adsbfi.status, count: adsbfi.ac.length },
            },
            ac: mergeAircraft(adsb, airplanes, adsbfi),
          };

          if (snapshot.ok) {
            await this.ctx.storage.put("aircraftSharedSnapshot", snapshot);
          }
          return snapshot;
        })().finally(() => {
          this.aircraftFetchPromise = null;
        });
      }

      const snapshot = await this.aircraftFetchPromise;
      return new Response(JSON.stringify({ ...snapshot, cache: "miss" }), {
        status: snapshot.ok ? 200 : 502,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

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

    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/flightaware-usage-cache") {
      if (request.method === "POST") {
        const payload = await request.json().catch(() => ({}));
        await this.ctx.storage.put("flightawareActualUsage", {
          ...payload,
          cached_at: Date.now(),
        });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }

      const state = (await this.ctx.storage.get("flightawareActualUsage")) || null;
      return new Response(JSON.stringify({ ok: true, usage: state }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/flightaware-budget") {
      const month = new Date().toISOString().slice(0, 7);
      let state = (await this.ctx.storage.get("flightawareBudget")) || { month, spent: 0, calls: 0 };
      if (state.month !== month) state = { month, spent: 0, calls: 0 };

      if (request.method === "POST") {
        const payload = await request.json().catch(() => ({}));
        const cost = Number(payload?.cost || 0);
        if (!Number.isFinite(cost) || cost < 0) {
          return new Response(JSON.stringify({ ok: false, error: "Invalid cost" }), {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }
        if (state.spent + cost > FLIGHTAWARE_MONTHLY_BUDGET_USD) {
          return new Response(JSON.stringify({
            ok: false,
            allowed: false,
            month: state.month,
            spent: state.spent,
            budget: FLIGHTAWARE_MONTHLY_BUDGET_USD,
          }), {
            status: 429,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }
        state.spent = Number((state.spent + cost).toFixed(3));
        state.calls += 1;
        await this.ctx.storage.put("flightawareBudget", state);
      }

      return new Response(JSON.stringify({
        ok: true,
        allowed: state.spent + FLIGHTAWARE_QUERY_COST_USD <= FLIGHTAWARE_MONTHLY_BUDGET_USD,
        month: state.month,
        spent: state.spent,
        calls: state.calls,
        budget: FLIGHTAWARE_MONTHLY_BUDGET_USD,
      }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  }
}

function localFlightAwareEligible(lat, lon, alt) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const dNm = distanceNm(KSU.lat, KSU.lon, lat, lon);
  const h = Number(alt);
  if (!Number.isFinite(h)) return dNm <= 10;
  if (dNm <= 10 && h <= 18000) return true;
  if (dNm <= 15 && h <= 12000) return true;
  if (dNm <= 20 && h <= 8000) return true;
  return false;
}

function routeUsable(route) {
  if (!route) return false;
  const codes = String(route.airport_codes || "").toLowerCase();
  const aps = Array.isArray(route._airports) ? route._airports : [];
  return route.plausible !== false && codes !== "unknown" && (aps.length >= 2 || (codes && codes !== "unknown"));
}

function faAirport(ap) {
  if (!ap) return null;
  const iata = ap.code_iata || "";
  const icao = ap.code_icao || "";
  const code = iata || icao || ap.code_lid || ap.code || "";
  if (!code) return null;
  return {
    code,
    iata,
    icao,
    name: ap.name || "",
    city: ap.city || "",
  };
}

function flightTimeScore(f) {
  const now = Date.now();
  const values = [
    f?.actual_off, f?.estimated_out, f?.scheduled_out,
    f?.actual_on, f?.estimated_in, f?.scheduled_in,
  ];
  const times = values.map((v) => Date.parse(v || "")).filter(Number.isFinite);
  if (!times.length) return Number.MAX_SAFE_INTEGER;
  return Math.min(...times.map((t) => Math.abs(t - now)));
}

async function flightAwareUsage(env, force = false) {
  if (!env.FLIGHTAWARE_API_KEY) return null;

  const id = env.TRACK_STORE.idFromName("ksu");
  const stub = env.TRACK_STORE.get(id);

  if (!force) {
    try {
      const cachedResponse = await stub.fetch("https://track-store/flightaware-usage-cache");
      if (cachedResponse.ok) {
        const cached = await cachedResponse.json();
        const usage = cached?.usage || null;
        if (usage && Number.isFinite(Number(usage.cached_at)) &&
            Date.now() - Number(usage.cached_at) < FLIGHTAWARE_USAGE_CACHE_MS) {
          return usage;
        }
      }
    } catch (error) {}
  }

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const u = new URL("https://aeroapi.flightaware.com/aeroapi/account/usage");
  u.searchParams.set("start", start.toISOString());
  u.searchParams.set("all_keys", "true");

  try {
    const r = await fetch(u.toString(), {
      headers: {
        "Accept": "application/json",
        "x-apikey": env.FLIGHTAWARE_API_KEY,
        "User-Agent": "Flyradar-KSU/1.0",
      },
    });
    if (!r.ok) return null;

    const j = await r.json();
    const usage = {
      total_calls: Number(j?.total_calls || 0),
      total_pages: Number(j?.total_pages || 0),
      total_cost: Number(j?.total_cost || 0),
      total_discount_cost: Number(j?.total_discount_cost || 0),
      total_successful_calls: Number(j?.total_successful_calls || 0),
      total_failed_calls: Number(j?.total_failed_calls || 0),
      resource_details: Array.isArray(j?.resource_details) ? j.resource_details : [],
      source: "flightaware",
      fetched_at: new Date().toISOString(),
    };

    await stub.fetch("https://track-store/flightaware-usage-cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(usage),
    }).catch(() => null);

    return usage;
  } catch (error) {
    return null;
  }
}

async function flightAwareRoute(env, callsign) {
  if (!env.FLIGHTAWARE_API_KEY) return null;

  const actualUsage = await flightAwareUsage(env);
  if (!actualUsage) return null;
  const actualCost = Number(actualUsage.total_cost || 0);
  if (!Number.isFinite(actualCost) ||
      actualCost + FLIGHTAWARE_QUERY_COST_USD > FLIGHTAWARE_MONTHLY_BUDGET_USD) {
    return null;
  }

  const id = env.TRACK_STORE.idFromName("ksu");
  const stub = env.TRACK_STORE.get(id);
  const reserve = await stub.fetch("https://track-store/flightaware-budget", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cost: FLIGHTAWARE_QUERY_COST_USD }),
  });
  if (!reserve.ok) return null;

  const u = new URL("https://aeroapi.flightaware.com/aeroapi/flights/" + encodeURIComponent(callsign));
  u.searchParams.set("max_pages", "1");
  const r = await fetch(u.toString(), {
    headers: {
      "Accept": "application/json",
      "x-apikey": env.FLIGHTAWARE_API_KEY,
      "User-Agent": "Flyradar-KSU/1.0",
    },
  });
  if (!r.ok) return null;

  const j = await r.json();
  const flights = Array.isArray(j?.flights) ? j.flights.slice() : [];
  flights.sort((a, b) => flightTimeScore(a) - flightTimeScore(b));

  const f = flights.find((x) => x?.origin && x?.destination) || null;
  if (!f) return null;

  const from = faAirport(f.origin);
  const to = faAirport(f.destination);
  if (!from || !to) return null;

  return {
    plausible: true,
    airport_codes: `${from.code}-${to.code}`,
    _airports: [from, to],
    _source: "flightaware",
    fa_flight_id: f.fa_flight_id || null,
    ident: f.ident || callsign,
  };
}

async function getSource(name, url) {
  try {
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      return { name, ok: false, status: response.status, ac: [] };
    }

    const json = await response.json();
    return {
      name,
      ok: true,
      status: response.status,
      ac: Array.isArray(json?.ac)
        ? json.ac
        : Array.isArray(json?.aircraft)
          ? json.aircraft
          : [],
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

    // Diagnostic only: OpenSky is not yet used for the live map.
    if (url.pathname === "/test-opensky") {
      const endpoint = "https://opensky-network.org/api/states/all?lamin=62.5&lomin=6.5&lamax=63.8&lomax=9.0";
      try {
        const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
        let count = null;
        let valid = false;
        if (response.ok) {
          const payload = await response.json();
          valid = Array.isArray(payload?.states);
          count = valid ? payload.states.length : null;
        }
        return new Response(JSON.stringify({
          ok: response.ok && valid,
          provider: "OpenSky Network",
          http_status: response.status,
          aircraft_count: count,
          rate_limit_remaining: response.headers.get("X-Rate-Limit-Remaining"),
          note: "One-off connectivity diagnostic; not connected to map"
        }), { status: 200, headers: { ...corsHeaders(), "Cache-Control": "public, max-age=600" } });
      } catch (error) {
        return new Response(JSON.stringify({ ok: false, provider: "OpenSky Network", error: String(error?.message || error) }),
          { status: 200, headers: { ...corsHeaders(), "Cache-Control": "public, max-age=600" } });
      }
    }

    if (url.pathname === "/vessels") {
      try {
        const r = await fetch("https://kystdatahuset.kystverket.no/ws/api/ais/realtime/geojson", {
          headers: { "User-Agent": "Flyradar-KSU/1.0" },
        });
        if (!r.ok) throw new Error("AIS HTTP " + r.status);
        const data = await r.json();
        const rows = Array.isArray(data?.features) ? data.features : (Array.isArray(data) ? data : []);
        const vessels = rows
          .map(normalizeVesselFeature)
          .filter(Boolean)
          .map(v => ({ ...v, distanceNm: distanceNm(KSU.lat, KSU.lon, v.lat, v.lon) }))
          .filter(v => v.distanceNm <= 35 && relevantPassengerVessel(v))
          .sort((a,b) => a.distanceNm - b.distanceNm);

        return new Response(JSON.stringify({
          ok: true,
          source: "kystverket",
          generated_at: new Date().toISOString(),
          count: vessels.length,
          vessels,
        }), {
          headers: { ...corsHeaders(), "Cache-Control": "public, max-age=20, s-maxage=30" },
        });
      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          source: "kystverket",
          error: String(error?.message || "AIS unavailable"),
          vessels: [],
        }), {
          status: 502,
          headers: { ...corsHeaders(), "Cache-Control": "no-store" },
        });
      }
    }

    if (url.pathname === "/route") {
      const callsign = (url.searchParams.get("callsign") || "").trim().toUpperCase();
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));
      const alt = Number(url.searchParams.get("alt"));
      const faScope = (url.searchParams.get("fa_scope") || "").toLowerCase();
      const allowFlightAware =
        faScope === "ksu" ||
        (faScope === "active50" && Number.isFinite(lat) && Number.isFinite(lon) &&
          distanceNm(KSU.lat, KSU.lon, lat, lon) <= 50) ||
        (faScope === "zone25" && Number.isFinite(lat) && Number.isFinite(lon) &&
          distanceNm(KSU.lat, KSU.lon, lat, lon) <= 25) ||
        (faScope === "local" && localFlightAwareEligible(lat, lon, alt));

      if (!callsign) {
        return new Response(JSON.stringify({ error: "Missing callsign" }), {
          status: 400,
          headers: corsHeaders(),
        });
      }

      let route = null;
      let source = null;
      let adsbLolAttempted = false;
      let adsbLolResult = "not-tried";
      let flightAwareAttempted = false;
      let flightAwareResult = "not-tried";

      try {
        adsbLolAttempted = true;
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

        if (r.ok) {
          const rows = await r.json();
          route = Array.isArray(rows) ? (rows[0] || null) : null;
          if (routeUsable(route)) {
            source = "adsb.lol";
            adsbLolResult = "found";
          } else {
            adsbLolResult = "no-route";
          }
        } else {
          adsbLolResult = "http-" + r.status;
        }
      } catch (error) {
        adsbLolResult = "error";
      }

      if (!routeUsable(route) && allowFlightAware) {
        flightAwareAttempted = true;
        try {
          const faRoute = await flightAwareRoute(env, callsign);
          if (routeUsable(faRoute)) {
            route = faRoute;
            source = "flightaware";
            flightAwareResult = "found";
          } else {
            flightAwareResult = "no-route";
          }
        } catch (error) {
          flightAwareResult = "error";
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        callsign,
        source,
        flightaware_allowed: allowFlightAware,
        diagnostics: {
          adsb_lol_attempted: adsbLolAttempted,
          adsb_lol_result: adsbLolResult,
          flightaware_attempted: flightAwareAttempted,
          flightaware_result: flightAwareResult,
        },
        route: routeUsable(route) ? route : null,
      }), {
        status: 200,
        headers: { ...corsHeaders(), "Cache-Control": "public, max-age=1800" },
      });
    }

    if (url.pathname === "/flightaware/status") {
      try {
        const id = env.TRACK_STORE.idFromName("ksu");
        const stub = env.TRACK_STORE.get(id);
        const [r, actualUsage] = await Promise.all([
          stub.fetch("https://track-store/flightaware-budget"),
          flightAwareUsage(env, true),
        ]);
        const budget = await r.json();
        const actualCost = Number(actualUsage?.total_cost);
        const actualAllowed = Boolean(
          actualUsage &&
          Number.isFinite(actualCost) &&
          actualCost + FLIGHTAWARE_QUERY_COST_USD <= FLIGHTAWARE_MONTHLY_BUDGET_USD
        );
        return new Response(JSON.stringify({
          ok: true,
          enabled: Boolean(env.FLIGHTAWARE_API_KEY),
          ...budget,
          allowed: Boolean(budget?.allowed && actualAllowed),
          actual_usage: actualUsage,
          actual_cost: Number.isFinite(actualCost) ? actualCost : null,
          usage_guard_ok: actualAllowed,
          usage_note: actualUsage
            ? "FlightAware usage can lag by about 10-20 minutes; internal budget is enforced in parallel."
            : "FlightAware usage unavailable; paid fallback is fail-closed.",
        }), {
          headers: { ...corsHeaders(), "Cache-Control": "no-store" },
        });
      } catch (error) {
        return new Response(JSON.stringify({ ok: false, enabled: Boolean(env.FLIGHTAWARE_API_KEY) }), {
          status: 500,
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
          flightaware_enabled: Boolean(env.FLIGHTAWARE_API_KEY),
          flightaware_budget_usd: FLIGHTAWARE_MONTHLY_BUDGET_USD,
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

    const sharedId = env.TRACK_STORE.idFromName("ksu");
    const sharedStub = env.TRACK_STORE.get(sharedId);
    const sharedResponse = await sharedStub.fetch("https://track-store/aircraft-shared");
    const shared = await sharedResponse.json();

    if (!sharedResponse.ok || !shared?.ok || !Array.isArray(shared?.ac)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "All aircraft sources failed",
          sources: shared?.sources || {},
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



    const ac = shared.ac;

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
        cache: shared.cache || "shared",
        sources: shared.sources || {},
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
      const sharedId = env.TRACK_STORE.idFromName("ksu");
      const sharedStub = env.TRACK_STORE.get(sharedId);
      const sharedResponse = await sharedStub.fetch("https://track-store/aircraft-shared");
      if (!sharedResponse.ok) return;
      const shared = await sharedResponse.json();
      if (!shared?.ok || !Array.isArray(shared?.ac)) return;

      const ac = shared.ac;

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
