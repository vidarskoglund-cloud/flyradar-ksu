// Pure eligibility for conservative automatic paid-fallback route lookup.
function automaticKsuRouteEligible(p,distanceNm,approachLabel){
  return Boolean(p?.flight&&!p.signalLost&&!p.routeData&&
    Number.isFinite(distanceNm)&&distanceNm<=50&&
    (Boolean(p.ksuFlight)||(distanceNm<=25&&approachLabel==='Ser ut til å være på innflyging')));
}
