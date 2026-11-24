// Pure decision about whether automatic focus should zoom/pan the map.
// Keeping map movement in app.js preserves Leaflet, manual override and transitions.
function shouldMoveMapFocus({pointsVisible,focusedOutside,currentZoom,wantedZoom,target,targetChanged,now,lastMoveAt,cooldownMs}){
  if(pointsVisible&&!focusedOutside&&Math.abs(currentZoom-wantedZoom)<=1)return false;
  // A focused aircraft outside the viewport bypasses the movement cooldown.
  if(target&&!targetChanged&&!focusedOutside&&
    now-lastMoveAt<cooldownMs&&target.d>5)return false;
  return true;
}
