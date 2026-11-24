// No airport position? Accept geocoded city centre only when the confirmed
// FlightAware city name matches and the result cannot be confused with another country.
function routeCityCandidate(airport,data){
  const city=String(airport?.city||'').trim();
  if(!city||!Array.isArray(data?.results))return null;
  const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .trim().toLocaleLowerCase('en');
  const country=String(airport?.country_code||airport?.country||'').trim().toUpperCase();
  // Two-letter ISO country codes must agree; anything else is too ambiguous.
  if(country&&!/^[A-Z]{2}$/.test(country))return null;
  const matches=data.results.filter(row=>
    normal(row?.name)===normal(city)&&
    (!country||String(row?.country_code||'').toUpperCase()===country)&&
    Number.isFinite(Number(row?.latitude))&&
    Number.isFinite(Number(row?.longitude))&&
    Math.abs(Number(row.latitude))<=90&&Math.abs(Number(row.longitude))<=180);
  if(!matches.length)return null;
  if(!country){
    // Do not choose Paris, France over Paris, Texas without country evidence.
    if(new Set(matches.map(row=>String(row.country_code||'').toUpperCase())).size!==1)return null;
  }
  const row=matches[0];
  return [Number(row.latitude),Number(row.longitude)];
}
