// Aircraft focus priority scoring only; this function has no map or network side effects.
// Business rules extracted unchanged from smartMapCandidate in app.js.
function rankAircraftMapFocus({groundLike,stationary,finalApproach,arrival,approach,departure,inboundByMotion,d,towardKsu,role}){
    let rank=0;
    if(groundLike&&!stationary)rank=6;
    else if(finalApproach)rank=5.5;
    else if(arrival&&d<=100&&(approach||d<=50))rank=5;
    else if(departure&&d<=25&&!stationary)rank=4;
    else if(inboundByMotion&&d<=50)rank=3.5;
    else if(d<=25&&!stationary)rank=d<=10?3.2:3;
    else if(inboundByMotion)rank=2.5;
    else if(arrival&&d<=100&&towardKsu)rank=2.5;
    // Give explicitly classified special flights a modest local focus boost.
    // Confirmed KSU operations (rank 5–6) continue to take precedence.
    if(role&&d<=50)rank=Math.max(rank,role.rank);
  return rank;
}
