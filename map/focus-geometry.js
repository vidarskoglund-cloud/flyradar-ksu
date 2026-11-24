// Pure geographic helpers for automatic map focus.
// Extracted from app.js without changing the calculations.
function angleDiff(a,b){
  return Math.abs((((a-b)+540)%360)-180);
}
function idleAirportDistanceNm(lat1,lon1,lat2,lon2){
 const radian=n=>n*Math.PI/180;
 const dlat=radian(lat2-lat1),dlon=radian(lon2-lon1);
 const a=Math.sin(dlat/2)**2+Math.cos(radian(lat1))*Math.cos(radian(lat2))*Math.sin(dlon/2)**2;
 return 3440.065*2*Math.asin(Math.min(1,Math.sqrt(a)));
}
