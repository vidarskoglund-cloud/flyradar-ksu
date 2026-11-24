// Pure decision about the automatic focus target; no map, timers or network access.
// Branch ordering retained from fitMap in app.js.
function chooseMapFocusTarget({best,glimpse,current,routineBoatFocus,now,changedAt,holdMs}){
  let target=routineBoatFocus&&glimpse?glimpse:(best||glimpse);
  // Keep current focus for at least the hold period, unless priority increases.
  if(current&&best&&current.key!==best.key&&
     now-changedAt<holdMs&&best.rank<=current.rank){
    target=current;
  }
  return target;
}
