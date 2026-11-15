const KSU = { lat: 63.1118, lon: 7.8245, radiusNm: 150 };

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
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: corsHeaders() }
      );
    }

    const url = new URL(request.url);

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

    return new Response(
      JSON.stringify({
        ok: true,
        generated_at: new Date().toISOString(),
        center: KSU,
        count: ac.length,
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
};
