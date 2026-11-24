// Privacy-friendly Cloudflare Web Analytics. No calls to the flight/ship Worker.
// Only the public radar page is counted; administration pages are excluded.
(function(){
  'use strict';
  const key='flyradar-ksu-exclude-my-visits-v1';
  const qs=new URLSearchParams(location.search);
  try{
    if(qs.get('exclude_stats')==='1')localStorage.setItem(key,'true');
    if(qs.get('exclude_stats')==='0')localStorage.removeItem(key);
    if(localStorage.getItem(key)==='true')return;
  }catch(e){
    // If the opt-out state cannot be read, do not send analytics.
    return;
  }
  const token=String(window.FLYRADAR_ANALYTICS_TOKEN||'').trim();
  if(!/^[a-f0-9]{32}$/i.test(token))return;
  // Prevent loading the third-party beacon during development or file previews.
  if(location.hostname!=='vidarskoglund-cloud.github.io')return;
  const beacon=document.createElement('script');
  beacon.defer=true;
  beacon.src='https://static.cloudflareinsights.com/beacon.min.js';
  beacon.dataset.cfBeacon=JSON.stringify({token,spa:false});
  document.head.appendChild(beacon);
})();
