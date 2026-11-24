// Exclude the site owner's traffic in this browser before analytics is enabled.
(function(){
 const key='flyradar-ksu-exclude-my-visits-v1';
 const btn=document.getElementById('analytics-own-toggle');
 const status=document.getElementById('analytics-own-status');
 if(!btn||!status)return;
 function sync(){
  try{
   const excluded=localStorage.getItem(key)==='true';
   btn.textContent=excluded?'Tell mine besøk igjen':'Utelat mine besøk på denne enheten';
   btn.setAttribute('aria-pressed',String(excluded));
   status.textContent=excluded?'Dine besøk telles ikke fra denne nettleseren.':'Dine besøk kan bli registrert hvis statistikken aktiveres.';
  }catch(e){
   btn.disabled=true;
   status.textContent='Nettleseren tillater ikke lagring. Statistikksporing er deaktivert når valget ikke kan leses.';
  }
 }
 btn.addEventListener('click',()=>{
  try{
   if(localStorage.getItem(key)==='true')localStorage.removeItem(key);
   else localStorage.setItem(key,'true');
  }catch(e){}
  sync();
 });
 sync();
})();
