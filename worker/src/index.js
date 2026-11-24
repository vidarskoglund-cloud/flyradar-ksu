import { DurableObject } from "cloudflare:workers";
import { buildPushPayload } from "@block65/webcrypto-web-push";

const ADSB_PAUSE_UNTIL_MS = 0; // ADS-B tracking enabled.
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
  const geometry = feature?.geometry || {};
  const coords = geometry.coordinates;
  // Kystverket provides vessel movement as GeoJSON LineString; the last
  // coordinate pair is the latest reported position.
  const point = geometry.type === "LineString" && Array.isArray(coords)
    ? coords[coords.length - 1]
    : geometry.type === "MultiLineString" && Array.isArray(coords)
      ? coords[coords.length - 1]?.slice(-1)?.[0]
      : coords;
  const lon = vesselNumber(p, ["longitude","lon","lng","x"]) ?? (Array.isArray(point) && point[0] != null ? Number(point[0]) : NaN);
  const lat = vesselNumber(p, ["latitude","lat","y"]) ?? (Array.isArray(point) && point[1] != null ? Number(point[1]) : NaN);
  const shipType = vesselNumber(p, ["ship_type","shipType","shiptype","type"]);
  const mmsi = vesselText(p, ["mmsi","MMSI"]);
  const name = vesselText(p, ["ship_name","name","shipName","vesselName","vessel_name"]);
  const speed = vesselNumber(p, ["speed","speedOverGround","sog","speed_over_ground"]);
  const course = vesselNumber(p, ["cog","courseOverGround","course","course_over_ground"]);
  const heading = vesselNumber(p, ["true_heading","trueHeading","heading"]);
  const destination = vesselText(p, ["destination","dest"]);
  const msgtime = vesselText(p, ["msgtime","timestamp","time","date_time_utc"]);
  // Static fields are optional; never manufacture missing IMO or vessel dimensions.
  const imo = vesselText(p, ["imo","IMO","imo_number","imoNumber"]);
  const length = vesselNumber(p, ["length","ship_length","shipLength","length_overall","loa"]);
  const width = vesselNumber(p, ["width","breadth","ship_width","shipWidth","beam"]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, shipType, mmsi, name, speed, course, heading, destination, msgtime, imo, length, width };
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
            `https://opendata.adsb.fi/api/v3/lat/${KSU.lat}/lon/${KSU.lon}/dist/${KSU.radiusNm}`;

          // Respect provider rate limits across requests and scheduled jobs.
          const cooldown = (await this.ctx.storage.get("aircraftSourceCooldown")) || {};
          // Use adsb.fi v3 as the sole aircraft provider.
          const providers = [["adsb.fi", adsbUrl]];
          const results = {};
          for (const [name, sourceUrl] of providers) {
            const previous = cooldown[name];
            const blockedUntil = Number(previous?.retry_at ?? previous ?? 0);
            if (blockedUntil > Date.now()) {
              results[name] = { name, ok: false, status: previous?.status ?? null, ac: [], last_attempt_at: previous?.last_attempt_at ?? null, retry_at: blockedUntil, waiting: true };
              continue;
            }
            const result = await getSource(name, sourceUrl);
            results[name] = result;
            if (!result.ok) {
              result.last_attempt_at = Date.now();
              result.retry_at = result.last_attempt_at + (result.status === 403 ? 15 * 60000 :
                result.status === 429 ? 5 * 60000 : 2 * 60000);
              cooldown[name] = { status: result.status, last_attempt_at: result.last_attempt_at, retry_at: result.retry_at };
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
              "adsb.lol": { ok: adsb.ok, status: adsb.status, count: adsb.ac.length, last_attempt_at: adsb.last_attempt_at ?? null, retry_at: adsb.retry_at ?? null, waiting: adsb.waiting === true },
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

// Kvernberget METAR observations and Kristiansund forecast are separate
// products: the former is measured, the latter is modelled.
const WEATHER_STATION='ENKB';
const WEATHER_CACHE_SECONDS=600;
const WEATHER_USER_AGENT='Kristiansund-Trafikkradar/1.0 (https://vidarskoglund-cloud.github.io/flyradar-ksu/)';
function numOrNull(value){
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);return Number.isFinite(n)?n:null;
}
function weatherObservation(rows,now=Date.now()){
 const row=(Array.isArray(rows)?rows:[]).find(r=>String(r?.icaoId||r?.station||r?.id||'').toUpperCase()===WEATHER_STATION);
 if(!row)return null;
 const rawTime=row.obsTime??row.reportTime??row.receiptTime;
 const parsed=typeof rawTime==='number'?rawTime*1000:Date.parse(String(rawTime||''));
 if(!Number.isFinite(parsed)||parsed>now+300000||now-parsed>2*60*60*1000)return null;
 const ktToMs=n=>n===null?null:Math.round(n*0.514444*10)/10;
 const dir=numOrNull(row.wdir);
 // AWC JSON 'altim' is already in hPa for many stations. Accept inches
 // of mercury only where the input is clearly in the 25-35 inHg range.
 const rawPressure=numOrNull(row.altim);
 const pressure=rawPressure!==null
  ?(rawPressure>=850&&rawPressure<=1100?Math.round(rawPressure):
    rawPressure>=25&&rawPressure<=35?Math.round(rawPressure*33.8639):null)
  :null;
 return {
  station:WEATHER_STATION,observed_at:new Date(parsed).toISOString(),
  temperature_c:numOrNull(row.temp),
  wind_mps:ktToMs(numOrNull(row.wspd)),
  gust_mps:ktToMs(numOrNull(row.wgst)),
  wind_direction_deg:dir!==null&&dir<=360?dir:null,
  visibility_m:numOrNull(row.visib)!==null?Math.round(Number(row.visib)*1609.344):null,
  pressure_hpa:pressure,
  raw:String(row.rawOb||row.raw||'').slice(0,350),
  source:'Aviation Weather Center / METAR ENKB'
 };
}
function weatherForecast(body){
 const times=body?.properties?.timeseries;
 if(!Array.isArray(times)||!times.length)return null;
 const first=times[0];
 const values=first?.data?.instant?.details;
 if(!values)return null;
 return {
  location:'Kristiansund sentrum',
  valid_at:String(first.time||''),
  temperature_c:numOrNull(values.air_temperature),
  wind_mps:numOrNull(values.wind_speed),
  gust_mps:numOrNull(values.wind_speed_of_gust),
  wind_direction_deg:numOrNull(values.wind_from_direction),
  precipitation_next_hour_mm:numOrNull(first?.data?.next_1_hours?.details?.precipitation_amount),
  symbol:String(first?.data?.next_1_hours?.summary?.symbol_code||''),
  source:'MET Norway Locationforecast'
 };
}
async function fetchWeather(){
 const requestHeaders={'User-Agent':WEATHER_USER_AGENT,Accept:'application/json'};
 const result=await Promise.allSettled([
  fetch('https://aviationweather.gov/api/data/metar?ids=ENKB&format=json',{
   headers:requestHeaders,signal:AbortSignal.timeout(10000)
  }).then(async r=>{if(!r.ok)throw new Error('METAR '+r.status);return r.json();}),
  fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=63.1115&lon=7.7600',{
   headers:requestHeaders,signal:AbortSignal.timeout(10000)
  }).then(async r=>{if(!r.ok)throw new Error('MET '+r.status);return r.json();})
 ]);
 const observation=result[0].status==='fulfilled'?weatherObservation(result[0].value):null;
 const forecast=result[1].status==='fulfilled'?weatherForecast(result[1].value):null;
 return {
  ok:Boolean(observation||forecast),
  observation,forecast,generated_at:new Date().toISOString(),
  sources:{observation:result[0].status==='fulfilled'?'available':'unavailable',
   forecast:result[1].status==='fulfilled'?'available':'unavailable'}
 };
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

    if (url.pathname === "/police") {
      // Free official public police feed. Keep private incident details out
      // of the public radar: only category, general area and publication time.
      const headers = { ...corsHeaders(), "Cache-Control": "public, max-age=60, s-maxage=300" };
      const cache = caches.default;
      const key = new Request("https://flyradar-ksu.vidar-skoglund.workers.dev/police?v=1");
      const hit = await cache.match(key);
      if (hit) return hit;
      try {
        const records = new Map();
        let pages = 0;
        let sawValidFormat = false;
        const now = Date.now();
        for (let skip = 0; skip < 150; skip += 50) {
          const params = new URLSearchParams({
            take: "50", skip: String(skip),
            sortByEnum: "LastMessageOn",
            timeSpanType: "LastQuarter"
          });
          const response = await fetch("https://api.politiloggen.politiet.no/messagethreads?" + params, {
            headers: { Accept: "application/json", "User-Agent": "KristiansundTrafikkradar/1.0 (+https://vidarskoglund-cloud.github.io/flyradar-ksu/)" },
            signal: AbortSignal.timeout(9500)
          });
          if (!response.ok) throw new Error("Politiloggen HTTP " + response.status);
          const body = await response.json();
          if (!Array.isArray(body?.messageThreads)) throw new Error("Uventet svarformat fra Politiloggen");
          sawValidFormat = true;
          pages++;
          for (const row of body.messageThreads) {
            const district = String(row?.district?.name || row?.district || "").toLowerCase();
            const municipality = String(row?.municipality?.name || row?.municipality || "").toLowerCase();
            if (!district.includes("møre og romsdal") || !municipality.includes("kristiansund")) continue;
            const rawCategory = String(row?.category?.name || row?.category || "");
            const category = rawCategory.toLowerCase();
            // Public infrastructure and emergency response only. No crime,
            // missing-person, assault or individual-focused categories.
            let kind = "";
            if (/trafikk|ulykke/.test(category)) kind = "trafikk";
            else if (/brann/.test(category)) kind = "brann";
            else if (/redning|sjø|vaer|vær/.test(category)) kind = "redning";
            else continue;
            const dateRaw = row?.updatedOn || row?.createdOn || "";
            const timestamp = Date.parse(dateRaw);
            if (!Number.isFinite(timestamp) || timestamp > now + 300000 || now - timestamp > 24 * 3600000) continue;
            const id = String(row?.id || "").trim();
            if (!id || !/^[a-zA-Z0-9_-]{4,70}$/.test(id)) continue;
            const area = String(row?.area || "Kristiansund").replace(/[<>]/g,"").trim().slice(0,75);
            const active = row?.isActive === true;
            records.set(id, { id, category:kind, label:rawCategory.slice(0,30),
              area, updated_at:new Date(timestamp).toISOString(), active });
          }
          if (!body.hasMoreResults || !body.messageThreads.length) break;
        }
        if (!sawValidFormat) throw new Error("Mangler svar fra Politiloggen");
        const incidents = [...records.values()]
          .sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)).slice(0,10);
        const out = new Response(JSON.stringify({
          ok:true, source:"Politiet – Politiloggen (NLOD 2.0)",
          checked_at:new Date().toISOString(), partial: pages === 3,
          location_scope:"Kristiansund kommune", incidents
        }), { headers });
        try { await cache.put(key,out.clone()); } catch (_) {}
        return out;
      } catch (error) {
        return new Response(JSON.stringify({
          ok:false,source:"Politiet – Politiloggen",
          error:"Datakilden er midlertidig utilgjengelig",
          detail:String(error?.message || error).slice(0,130)
        }), { status:503, headers:{...corsHeaders(),"Cache-Control":"no-store"} });
      }
    }

    if (url.pathname === "/speedboat") {
      // Entur access through the Worker avoids browser CORS/preflight problems.
      // No credentials or paid services; cache to keep request volume low.
      const headers = { ...corsHeaders(), "Cache-Control": "public, max-age=60, s-maxage=300" };
      const cache = caches.default;
      const key = new Request("https://flyradar-ksu.vidar-skoglund.workers.dev/speedboat?version=1");
      const hit = await cache.match(key);
      if (hit) return hit;
      const enturHeaders = { "ET-Client-Name": "vidarskoglund-trafikkradar" };
      const getEntur = async (path) => {
        const r = await fetch("https://api.entur.io" + path, { headers: enturHeaders, signal: AbortSignal.timeout(11000) });
        if (!r.ok) throw new Error("Entur geocoder HTTP " + r.status);
        return r.json();
      };
      try {
        const searches = [
          { q: "Kristiansund hurtigbåtkai", limit: "25", layers: "stopPlace", multimodal: "all" },
          { q: "Kristiansund trafikkterminal", limit: "25", layers: "stopPlace", multimodal: "all" },
          { q: "Kristiansund", limit: "40", layers: "stopPlace", multimodal: "all" }
        ];
        const selected = new Map();
        for (const search of searches) {
          const params = new URLSearchParams({ ...search, lang: "no" });
          const data = await getEntur("/geocoder/v3/autocomplete?" + params);
          for (const feature of data.features || []) {
            const p = feature.properties || {};
            const name = String(p.names?.default || p.name || "").toLowerCase();
            const id = String(p.id || feature.id || "");
            const c = feature.geometry?.coordinates;
            if (!/^NSR:StopPlace:\d+$/.test(id) || !Array.isArray(c) ||
                Math.abs(Number(c[1]) - 63.112) > 0.065 ||
                Math.abs(Number(c[0]) - 7.73) > 0.08) continue;
            const modes = p.transportModes || [];
            const water = modes.some(m => /water|ferry/i.test(String(m?.mode || m)));
            const named = /hurtigbåt|hurtigbat|trafikkterminal|fausken/i.test(name);
            if (!name.includes("kristiansund") || (!water && !named)) continue;
            selected.set(id, { id, name, preferred: water || /hurtigbåt|hurtigbat/i.test(name) });
          }
          if ([...selected.values()].some(v => v.preferred)) break;
        }
        const stops = [...selected.values()].sort((a,b) => Number(b.preferred) - Number(a.preferred)).slice(0,3);
        if (!stops.length) throw new Error("Fant ikke stoppested ved Kristiansund hurtigbåtkai i Entur");
        const query = `query KsuSpeedboat($id:String!){
          stopPlace(id:$id){ id name estimatedCalls(timeRange:93600,numberOfDepartures:120,arrivalDeparture:both){
            aimedArrivalTime expectedArrivalTime actualArrivalTime
            aimedDepartureTime expectedDepartureTime actualDepartureTime
            forAlighting forBoarding realtime cancellation predictionInaccurate
            serviceJourney{line{publicCode transportMode}}
            destinationDisplay{frontText}
          }}
        }`;
        const calls = [], found = [];
        for (const stop of stops) {
          const response = await fetch("https://api.entur.io/journey-planner/v3/graphql", {
            method: "POST",
            headers: { ...enturHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables: { id: stop.id } }),
            signal: AbortSignal.timeout(11000)
          });
          if (!response.ok) throw new Error("Entur journey-planner HTTP " + response.status);
          const result = await response.json();
          if (result.errors?.length) throw new Error("Entur GraphQL: " + String(result.errors[0].message).slice(0,150));
          if (result.data?.stopPlace) {
            found.push({ id: stop.id, name: result.data.stopPlace.name });
            calls.push(...(result.data.stopPlace.estimatedCalls || []));
          }
          if (calls.some(c => ["800","805"].includes(String(c?.serviceJourney?.line?.publicCode || "")))) break;
        }
        const filtered = calls.filter(c => ["800","805"].includes(String(c?.serviceJourney?.line?.publicCode || "")));
        const response = new Response(JSON.stringify({
          ok: true, source: "Entur Journey Planner v3",
          checked_at: new Date().toISOString(), stops: found,
          calls: filtered, scanned_calls: calls.length
        }), { headers });
        try { await cache.put(key, response.clone()); } catch (_) {}
        return response;
      } catch (error) {
        return new Response(JSON.stringify({
          ok: false, state: "entur_unavailable",
          reason: String(error?.message || error).slice(0,180)
        }), { status: 503, headers: { ...corsHeaders(), "Cache-Control": "no-store" } });
      }
    }

    if (url.pathname === "/datex/roads") {
      const headers = { ...corsHeaders(), "Cache-Control": "public, max-age=60, s-maxage=300" };
      if (!env.DATEX_USERNAME || !env.DATEX_PASSWORD) {
        return new Response(JSON.stringify({ ok: false, state: "credentials_missing" }), { status: 503, headers: { ...corsHeaders(), "Cache-Control": "no-store" } });
      }
      const cache = caches.default;
      const cacheKey = new Request("https://flyradar-ksu.vidar-skoglund.workers.dev/datex/roads?geocoded=v1");
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
      const lastGoodKey = new Request("https://flyradar-ksu.vidar-skoglund.workers.dev/datex/roads?last_good=v1");
      const lastGood = async (reason) => {
        try {
          const cached = await cache.match(lastGoodKey);
          if (!cached) return null;
          const prev = await cached.json();
          const age = Date.now() - Date.parse(prev?.checked_at);
          if (!prev?.ok || !prev?.roads || !Number.isFinite(age) || age < 0 || age > 21600000) return null;
          return new Response(JSON.stringify({...prev, stale: true, stale_reason: reason,
            status_note: "Tidligere DATEX-registreringer, oppdatering feilet. Aktiv status er ikke bekreftet."}),
            {headers:{...corsHeaders(),"Cache-Control":"no-store"}});
        } catch (_) { return null; }
      };
      const roads = [
        ["Freifjordtunnelen", /freifjord(?:tunnel|tunell)/i],
        ["Atlanterhavstunnelen", /atlanterhavstunnel/i],
        ["Bergsøysundbrua", /bergs(?:ø|o|oe)ysund/i],
        ["Omsundbrua", /omsundbrua/i],
        ["Nordsundbrua", /nordsundbrua/i]
      ];
      const perRoad = Object.fromEntries(roads.map(([name]) => [name, []]));
      const local = [];
      const seen = new Set();
      let records = 0, processedBytes = 0, complete = false;
      try {
        const upstream = await fetch("https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata", {
          headers: {
            Authorization: "Basic " + btoa(env.DATEX_USERNAME + ":" + env.DATEX_PASSWORD),
            Accept: "application/xml, text/xml;q=0.9"
          },
          redirect: "manual",
          signal: AbortSignal.timeout(25000)
        });
        if (!upstream.ok || !upstream.body) {
          if (upstream.body) await upstream.body.cancel();
          return (await lastGood("upstream_error")) || new Response(JSON.stringify({ ok: false, state: "upstream_error", http_status: upstream.status }),
            { status: 503, headers: { ...corsHeaders(), "Cache-Control": "no-store" } });
        }
        const reader = upstream.body.getReader(), decoder = new TextDecoder();
        let buffer = "";
        // A bounded scan fits Workers CPU/time limits; larger snapshots are marked partial.
        const maxBytes = 12 * 1024 * 1024;
        const field = (source, tag) => {
          const re = new RegExp("<(?:[\\w.-]+:)?" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?" + tag + "\\s*>", "i");
          const m = source.match(re);
          return m ? m[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
        };
        const processRecord = (raw) => {
          records++;
          // Filter first; expensive per-record parsing is only needed for local roads.
          // Alert-C external location names may refer to a broader nearby route.
          const location = field(raw, "locationDescription").slice(0, 320);
          if (!location) return;
          const matchedRoads = roads.filter(([, pattern]) => pattern.test(location)).map(([name]) => name);
          if (!matchedRoads.length && !/kristiansund/i.test(location)) return;
          const type = (raw.match(/xsi:type=["'][^"']*:([^"']+)/i) || [])[1] || "Unknown";
          const comment = field(raw, "comment").slice(0, 300);
          const id = (raw.match(/\bid=["']([^"']+)["']/i) || [])[1] || "";
          const baseId = id.replace(/_\d+$/, "");
          const start = field(raw, "overallStartTime") || null;
          const end = field(raw, "overallEndTime") || null;
          const validity = field(raw, "validityStatus") || null;
          // DATEX coordinatesForDisplay are WGS84 latitude / longitude.
          // Never infer a marker position from place names or Alert-C codes.
          const position = (raw.match(/<(?:[\w.-]+:)?coordinatesForDisplay\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?coordinatesForDisplay\s*>/i) || [])[1] || "";
          const lat = Number(field(position, "latitude"));
          const lon = Number(field(position, "longitude"));
          const coordinatesValid = position && Number.isFinite(lat) && Number.isFinite(lon) &&
            lat >= 62.9 && lat <= 63.35 && lon >= 7.35 && lon <= 8.6;
          const item = { place: location, type, message: comment, start, end, validity,
            ...(coordinatesValid ? { lat, lon } : {}) };
          for (const name of matchedRoads) {
            const dedupe = name + "|" + (baseId || location + comment);
            if (seen.has(dedupe)) continue;
            seen.add(dedupe);
            if (perRoad[name].length < 5) perRoad[name].push(item);
          }
          if (/kristiansund/i.test(location)) {
            const dedupe = "local|" + (baseId || location + comment);
            if (!seen.has(dedupe)) {
              seen.add(dedupe);
              if (local.length < 15) local.push(item);
            }
          }
        };
        const opening = /<(?:[\w.-]+:)?situationRecord\b/;
        const closing = /<\/(?:[\w.-]+:)?situationRecord\s*>/;
        while (processedBytes < maxBytes) {
          const part = await reader.read();
          if (part.done) { complete = true; break; }
          processedBytes += part.value.byteLength;
          buffer += decoder.decode(part.value, { stream: true });
          let open;
          while ((open = buffer.search(opening)) !== -1) {
            const afterOpen = buffer.slice(open);
            const end = afterOpen.search(closing);
            if (end < 0) { buffer = afterOpen; break; }
            const closingTag = afterOpen.slice(end).match(closing)?.[0] || "";
            const raw = afterOpen.slice(0, end + closingTag.length);
            processRecord(raw);
            buffer = afterOpen.slice(end + closingTag.length);
          }
          if (open === -1 && buffer.length > 200) buffer = buffer.slice(-200);
          if (buffer.length > 2 * 1024 * 1024) {
            throw Error("Oversized XML record");
          }
        }
        if (!complete) await reader.cancel();
        const result = {
          ok: true, source: "Statens vegvesen DATEX II 3.1",
          checked_at: new Date().toISOString(),
          complete, bytes_read: processedBytes, records,
          coverage: complete ? "complete_snapshot" : "partial_snapshot",
          roads: perRoad, local,
          geocoded: [...Object.values(perRoad).flat(), ...local].filter((event) =>
            Number.isFinite(event.lat) && Number.isFinite(event.lon)).length,
          status_note: "Registrerte DATEX-hendelser, ikke verifisert som aktive. Fravær av treff betyr ikke åpen vei."
        };
        const response = new Response(JSON.stringify(result), { headers });
        // Cache failures must not turn a successful DATEX parse into an outage.
        try { await cache.put(cacheKey, response.clone()); } catch (_) {}
        try { await cache.put(lastGoodKey, new Response(JSON.stringify(result),
          {headers:{...corsHeaders(),"Cache-Control":"public, max-age=21600"}})); } catch (_) {}
        return response;
      } catch (error) {
        return (await lastGood("processing_error")) || new Response(JSON.stringify({ ok: false, state: "processing_error",
          category: /timeout|abort/i.test(String(error?.name || "")) ? "timeout" : "network_or_xml",
          checked_at: new Date().toISOString(), records, bytes_read: processedBytes }),
          { status: 503, headers: { ...corsHeaders(), "Cache-Control": "no-store" } });
      }
    }

    if (url.pathname === "/datex/local-preview") {
      // Limited discovery of relevant complete records, not a production status feed.
      const headers = { ...corsHeaders(), "Cache-Control": "no-store" };
      if (!env.DATEX_USERNAME || !env.DATEX_PASSWORD) {
        return new Response(JSON.stringify({ ok: false, state: "credentials_missing" }), { status: 503, headers });
      }
      const names = [
        ["Freifjordtunnelen", /freifjord(?:tunnel|tunell)/i],
        ["Atlanterhavstunnelen", /atlanterhavstunnel/i],
        ["Bergsøysundbrua", /bergs(?:ø|o|oe)ysund/i],
        ["Omsundbrua", /omsund/i],
        ["Nordsundbrua", /nordsund/i],
        ["Kristiansund", /kristiansund/i]
      ];
      const found = Object.fromEntries(names.map(([name]) => [name, []]));
      const startedAt = Date.now();
      try {
        const resp = await fetch(
          "https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata",
          { headers: {
              Authorization: "Basic " + btoa(env.DATEX_USERNAME + ":" + env.DATEX_PASSWORD),
              Accept: "application/xml, text/xml;q=0.9"
            }, redirect: "manual", signal: AbortSignal.timeout(25000) }
        );
        if (!resp.ok) {
          if (resp.body) await resp.body.cancel();
          return new Response(JSON.stringify({ ok: false, state: "upstream_error", http_status: resp.status }), { status: 503, headers });
        }
        // Retain only a limited XML prefix, and only return small public-road excerpts.
        const limit = 12 * 1024 * 1024;
        let xml = "", bytes = 0, truncated = false;
        const reader = resp.body?.getReader();
        if (!reader) throw Error("No stream");
        const decoder = new TextDecoder();
        while (bytes < limit) {
          const p = await reader.read();
          if (p.done) break;
          const take = Math.min(p.value.byteLength, limit - bytes);
          xml += decoder.decode(p.value.subarray(0, take), { stream: true });
          bytes += take;
          if (take < p.value.byteLength) { truncated = true; break; }
        }
        if (bytes >= limit) truncated = true;
        if (truncated) await reader.cancel();
        xml += decoder.decode();
        const re = /<(?:[A-Za-z_][\w.-]*:)?situationRecord\b[^>]*>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?situationRecord\s*>/g;
        let completeRecords = 0;
        const strip = (value) => value.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
        for (const match of xml.matchAll(re)) {
          completeRecords++;
          const raw = match[0];
          for (const [name, pattern] of names) {
            if (!pattern.test(raw) || found[name].length >= 4) continue;
            const type = (raw.match(/xsi:type=["'][^"']*:([^"']+)/) || [])[1] || "unknown";
            // Collect only short fields directly useful for investigating the feed.
            const descriptions = [...raw.matchAll(/<(?:[A-Za-z_][\w.-]*:)?(?:alertCLocationName|locationDescription|comment|areaName)\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?(?:alertCLocationName|locationDescription|comment|areaName)\s*>/g)]
              .map(m => strip(m[1])).filter(Boolean).slice(0, 4).map(v => v.slice(0, 180));
            found[name].push({ type, descriptions });
          }
        }
        return new Response(JSON.stringify({
          ok: true, source: "Statens vegvesen DATEX II 3.1",
          scanned_bytes: bytes, truncated, complete_records_in_prefix: completeRecords,
          matches: found, checked_at: new Date().toISOString(),
          elapsed_ms: Date.now() - startedAt,
          note: "Exploratory incomplete XML prefix; entries have not been validated as active events"
        }), { headers });
      } catch (error) {
        return new Response(JSON.stringify({ ok: false, state: "preview_error",
          category: /timeout|abort/i.test(String(error?.name || "")) ? "timeout" : "fetch_or_parse"
        }), { status: 503, headers });
      }
    }

    if (url.pathname === "/datex/inspect") {
      // Read-only, bounded DATEX schema discovery. No raw XML, credentials
      // or authorization headers are returned to public callers.
      const headers = { ...corsHeaders(), "Cache-Control": "no-store" };
      if (!env.DATEX_USERNAME || !env.DATEX_PASSWORD) {
        return new Response(JSON.stringify({ ok: false, state: "credentials_missing" }), { status: 503, headers });
      }
      const start = Date.now();
      try {
        const upstream = await fetch(
          "https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata",
          {
            headers: {
              Authorization: "Basic " + btoa(env.DATEX_USERNAME + ":" + env.DATEX_PASSWORD),
              Accept: "application/xml, text/xml;q=0.9"
            },
            redirect: "manual",
            signal: AbortSignal.timeout(25000)
          }
        );
        if (!upstream.ok) {
          if (upstream.body) await upstream.body.cancel();
          return new Response(JSON.stringify({ ok: false, state: "upstream_error", http_status: upstream.status }),
            { status: 503, headers });
        }
        // The entire upstream feed can be large. Inspect a bounded prefix;
        // if truncated, never interpret a missing keyword as no event.
        const limit = 12 * 1024 * 1024;
        let xml = "", bytes = 0, truncated = false;
        const reader = upstream.body?.getReader();
        if (!reader) throw Error("No upstream body");
        const decoder = new TextDecoder();
        while (bytes < limit) {
          const part = await reader.read();
          if (part.done) break;
          const remaining = limit - bytes;
          const slice = part.value.byteLength > remaining ? part.value.subarray(0, remaining) : part.value;
          xml += decoder.decode(slice, { stream: true });
          bytes += slice.byteLength;
          if (part.value.byteLength > remaining) { truncated = true; break; }
        }
        if (bytes >= limit) truncated = true;
        if (truncated) await reader.cancel();
        xml += decoder.decode();
        const tags = new Map();
        for (const match of xml.matchAll(/<([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)\b/g)) {
          const tag = match[2];
          tags.set(tag, (tags.get(tag) || 0) + 1);
        }
        const terms = [
          "Freifjord", "Atlanterhavstunnel", "Bergsøysund", "Bergsoysund",
          "Omsund", "Nordsund", "Kristiansund", "Krifast", "Gjemnes",
          "E39", "Rv70", "Fv64"
        ];
        const matched = [];
        for (const term of terms) {
          const positions = [];
          const lower = xml.toLocaleLowerCase("nb-NO"), needle = term.toLocaleLowerCase("nb-NO");
          let at = 0;
          while (positions.length < 3 && (at = lower.indexOf(needle, at)) !== -1) {
            const left = Math.max(0, at - 110), right = Math.min(xml.length, at + needle.length + 110);
            const context = xml.slice(left, right)
              .replace(/<[^>]*>/g, " ").replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi, " ")
              .replace(/\s+/g, " ").trim().slice(0, 180);
            positions.push(context);
            at += needle.length;
          }
          if (positions.length) matched.push({ term, examples: positions });
        }
        const root = xml.match(/<(?!\?|!)([A-Za-z_][\w:.-]*)\b/);
        const topTags = [...tags.entries()].sort((a,b) => b[1] - a[1]).slice(0, 35)
          .map(([name,count]) => ({ name, count }));
        return new Response(JSON.stringify({
          ok: true, source: "Statens vegvesen DATEX II 3.1",
          checked_at: new Date().toISOString(),
          bytes_inspected: bytes, truncated, root_tag: root?.[1] || null,
          top_tags: topTags, matching_terms: matched,
          elapsed_ms: Date.now() - start,
          note: truncated ? "Partial XML prefix; no-match does not imply no active event" :
            "Tag counts describe the returned XML; not yet a validated geographic filter"
        }), { headers: { ...corsHeaders(), "Cache-Control": "no-store" } });
      } catch (error) {
        return new Response(JSON.stringify({ ok: false, state: "inspection_error",
          error_category: /timeout|abort/i.test(String(error?.name || "")) ? "timeout" : "fetch_or_parse",
          checked_at: new Date().toISOString() }), { status: 503, headers });
      }
    }

    if (url.pathname === "/datex/check") {
      // Read-only connectivity check. Never return credentials or traffic XML.
      // Keep this on the feature branch until credentials are installed and tested.
      const headers = { ...corsHeaders(), "Cache-Control": "no-store" };
      if (!env.DATEX_USERNAME || !env.DATEX_PASSWORD) {
        return new Response(JSON.stringify({
          ok: false, configured: false, state: "credentials_missing",
          bindings: {
            datex_username: Boolean(env.DATEX_USERNAME),
            datex_password: Boolean(env.DATEX_PASSWORD),
            flightaware_key: Boolean(env.FLIGHTAWARE_API_KEY),
            track_store: Boolean(env.TRACK_STORE)
          },
          source: "Statens vegvesen DATEX II 3.1"
        }), { status: 503, headers });
      }
      // No cached diagnostics: stale errors obscure new deployments.
      let result;
      let stage = "authorization";
      const startedAt = Date.now();
      try {
        const authorization = "Basic " + btoa(env.DATEX_USERNAME + ":" + env.DATEX_PASSWORD);
        stage = "upstream_fetch";
        const upstream = await fetch(
          "https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata",
          { headers: { Authorization: authorization, Accept: "application/xml, text/xml;q=0.9" },
            signal: AbortSignal.timeout(15000), redirect: "manual" }
        );
        const contentType = upstream.headers.get("Content-Type") || "";
        const xml = upstream.ok && /(?:xml|octet-stream)/i.test(contentType);
        if (upstream.body) await upstream.body.cancel();
        result = {
          ok: Boolean(xml), configured: true,
          elapsed_ms: Date.now() - startedAt,
          state: xml ? "xml_response" : upstream.status === 401 || upstream.status === 403 ?
            "access_denied" : upstream.status === 200 ? "unexpected_format" : "upstream_error",
          http_status: upstream.status,
          source: "Statens vegvesen DATEX II 3.1",
          checked_at: new Date().toISOString()
        };
      } catch (error) {
        // Expose only safe categories, never exception messages or credentials.
        const kind = String(error?.name || "");
        const category = kind === "TimeoutError" || kind === "AbortError" ?
          "timeout" : kind === "TypeError" ? "network_or_redirect" :
          stage === "authorization" ? "authorization_encoding" : "unknown";
        result = {
          ok: false, configured: true, state: "connection_error",
          error_category: category, stage,
          elapsed_ms: Date.now() - startedAt,
          source: "Statens vegvesen DATEX II 3.1",
          checked_at: new Date().toISOString()
        };
      }
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 503,
        headers: { ...corsHeaders(), "Cache-Control": "no-store" }
      });
    }

    if(url.pathname==='/weather'){
      // A bounded shared edge cache prevents each website visitor from
      // issuing separate requests to weather providers.
      const cacheKey=new Request('https://flyradar-ksu.vidar-skoglund.workers.dev/weather');
      const cache=caches.default;
      const cached=await cache.match(cacheKey);
      if(cached)return cached;
      let payload;
      try{payload=await fetchWeather();}
      catch(e){payload={ok:false,observation:null,forecast:null,generated_at:new Date().toISOString()};}
      const response=new Response(JSON.stringify(payload),{
       status:200,headers:{...corsHeaders(),'Cache-Control':'public, max-age=120, s-maxage='+WEATHER_CACHE_SECONDS}
      });
      if(payload.ok)await cache.put(cacheKey,response.clone());
      return response;
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
        const aisUrl = "https://kystdatahuset.kystverket.no/ws/api/ais/realtime/geojson";
        let data, lastAisError;
        // Retry once on transient upstream errors. Never retry permanent 4xx.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const r = await fetch(aisUrl, {
              headers: { "User-Agent": "Flyradar-KSU/1.0", "Accept": "application/geo+json, application/json" },
              signal: AbortSignal.timeout(12000),
            });
            if (!r.ok) {
              if (r.status >= 400 && r.status < 500) throw new Error("AIS permanent HTTP " + r.status);
              throw new Error("AIS HTTP " + r.status);
            }
            data = await r.json();
            break;
          } catch (error) {
            lastAisError = error;
            if (String(error?.message || "").includes("permanent") || attempt === 1) break;
            await new Promise(resolve => setTimeout(resolve, 400));
          }
        }
        if (!data) throw lastAisError || new Error("AIS upstream unavailable");
        const rows = Array.isArray(data?.features) ? data.features : (Array.isArray(data) ? data : []);
        const parsed = rows.map(normalizeVesselFeature).filter(Boolean);
        const nearby = parsed.map(v => ({ ...v, distanceNm: distanceNm(KSU.lat, KSU.lon, v.lat, v.lon) }))
          .filter(v => v.distanceNm <= 25);
        const vessels = parsed.map(v => {
          const distanceNmFromKsu = distanceNm(KSU.lat, KSU.lon, v.lat, v.lon);
          const name = String(v.name || "").toUpperCase();
          const dest = String(v.destination || "").toUpperCase();
          const coastal = /(HAVILA|HURTIGRUTEN|NORDLYS|POLARLYS|KONG HARALD|NORDKAPP|RICHARD WITH|MIDNATSOL|FINNMARKEN|TROLLFJORD|NORDSTJERNEN|LOFOTEN|VESTERALEN|SPITSBERGEN|CAPELLA|CASTOR|POLARIS|POLLUX)/.test(name);
          const fastNamed = /(TRONDHEIMSFJORD|TER NINGEN|TERNINGEN|TYRHAUG|FJORDPRINSESSEN|FJORDDRONNINGEN)/.test(name);
          const fastRoute = Number(v.shipType) >= 40 && Number(v.shipType) <= 49 &&
            /(TRONDHEIM|KRISTIANSUND|BREKSTAD|EDOY|EDØY)/.test(dest);
          const category = coastal ? "hurtigrute" : fastNamed ? "hurtigbat" : fastRoute ? "mulig_hurtigbat" : "";
          return { ...v, distanceNm: distanceNmFromKsu, category };
        }).filter(v => Number.isFinite(v.speed) && v.speed >= 1 &&
          (v.distanceNm <= 25 || (v.category && v.distanceNm <= 110)))
          .sort((a,b) => a.distanceNm - b.distanceNm);
        const diagnostic = {
          upstream_type: Array.isArray(data) ? "array" : String(data?.type || typeof data),
          upstream_rows: rows.length,
          parsed_coordinates: parsed.length,
          within_25_nm: nearby.length,
          with_speed: nearby.filter(v => Number.isFinite(v.speed)).length,
          moving: vessels.length,
          sample_property_keys: rows.length ? Object.keys(rows[0]?.properties || rows[0] || {}).slice(0,25) : [],
          sample_geometry: rows.slice(0,3).map(v => ({ type: v?.geometry?.type || null, coordinates: JSON.stringify(v?.geometry?.coordinates ?? null).slice(0,160), lat: v?.properties?.latitude ?? null, lon: v?.properties?.longitude ?? null }))
        };

        return new Response(JSON.stringify({
          ok: true,
          source: "kystverket",
          generated_at: new Date().toISOString(),
          count: vessels.length,
          diagnostic,
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
      let adsbLolErrorType = null;
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
          signal: AbortSignal.timeout(3500),
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
        adsbLolErrorType = error?.name === "AbortError" || error?.name === "TimeoutError"
          ? "timeout"
          : error instanceof SyntaxError ? "invalid-json"
          : "network-or-upstream";
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
          adsb_lol_error_type: adsbLolErrorType,
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

    if (Date.now() < ADSB_PAUSE_UNTIL_MS) {
      return new Response(JSON.stringify({ ok: false, paused: true, resume_at: new Date(ADSB_PAUSE_UNTIL_MS).toISOString(), ac: [] }), {
        status: 503, headers: { ...corsHeaders(), "Cache-Control": "no-store" }
      });
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
    if (Date.now() < ADSB_PAUSE_UNTIL_MS) return;

    return; // Diagnostic mode: disable scheduled ADS-B polling and push checks.

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
