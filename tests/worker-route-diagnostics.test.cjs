const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../worker/src/index.js'),'utf8');
const start=src.indexOf('if (url.pathname === "/route")');
const end=src.indexOf('if (url.pathname === "/flightaware/status")',start);
const route=src.slice(start,end);
test('adsb.lol routeset request has an explicit 3.5 second timeout',()=>{
 assert.ok(start>0&&end>start);
 assert.match(route,/fetch\("https:\/\/api\.adsb\.lol\/api\/0\/routeset"/);
 assert.match(route,/signal: AbortSignal\.timeout\(3500\)/);
});
test('diagnostics distinguish timeout, invalid JSON and upstream/network errors',()=>{
 assert.match(route,/adsbLolErrorType = error\?\.name/);
 assert.match(route,/"timeout"/);
 assert.match(route,/"invalid-json"/);
 assert.match(route,/"network-or-upstream"/);
 assert.match(route,/adsb_lol_error_type: adsbLolErrorType/);
 assert.match(route,/adsbLolResult = "http-" \+ r\.status/);
});
test('FlightAware first for validated overflight, otherwise fallback only after free miss',()=>{
 assert.match(route,/if \(!routeUsable\(route\) && allowFlightAware && !overflight\)/);
 assert.match(route,/if \(overflight\) \{/);
 assert.match(route,/flightAwareRoute\(env, callsign\)/);
 assert.match(src,/FLIGHTAWARE_MONTHLY_BUDGET_USD = 4\.50/);
 assert.match(src,/actualCost \+ FLIGHTAWARE_QUERY_COST_USD > FLIGHTAWARE_MONTHLY_BUDGET_USD/);
});

test('free-only retries bypass paid FlightAware and failed responses are not cached',()=>{
 assert.match(route,/const freeOnly = url\.searchParams\.get\("free_only"\) === "1"/);
 assert.match(route,/const allowFlightAware = !freeOnly && \(overflight \|\|/);
 assert.match(route,/if \(overflight && !freeOnly\)/);
 assert.match(route,/Cache-Control": routeUsable\(route\)/);
});
