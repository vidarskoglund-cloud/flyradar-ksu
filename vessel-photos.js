(function(){
'use strict';
const CACHE='kristiansund-vessel-photos-v2', pending=new Map();
function get(key){
 try{const item=JSON.parse(localStorage.getItem(CACHE)||'{}')[key];return item&&item.until>Date.now()?{hit:true,photo:item.photo}:{hit:false};}catch(e){return {hit:false};}
}
function save(key,photo){
 try{
  const now=Date.now(),raw=JSON.parse(localStorage.getItem(CACHE)||'{}'),items=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  for(const k of Object.keys(items))if(!items[k]||items[k].until<=now)delete items[k];
  items[key]={photo,until:now+(photo?7:1)*86400000};
  localStorage.setItem(CACHE,JSON.stringify(Object.fromEntries(Object.entries(items).slice(-100))));
 }catch(e){}
}
function plain(value){
 const d=document.createElement('div');d.innerHTML=String(value||'');
 return (d.textContent||'').trim().replace(/\s+/g,' ').slice(0,125);
}
function pick(v,pages){
 const words=String(v.name||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').trim().split(/\s+/).filter(w=>w.length>=3);
 const imo=String(v.imo||'').replace(/\D/g,'');
 const mmsi=String(v.mmsi||'').replace(/\D/g,'');
 if(!words.length&&imo.length!==7&&mmsi.length!==9)return null;
 const options=[];
 for(const page of Object.values(pages||{})){
  const f=String(page.title||'').replace(/^File:/i,'');
  if(!/\.(jpe?g|webp)$/i.test(f))continue;
  const fileWords=f.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/);
  const sameName=words.length>=2&&words.every(w=>fileWords.includes(w));
  const sameImo=imo.length===7&&fileWords.includes(imo);
  const sameMmsi=mmsi.length===9&&fileWords.includes(mmsi);
  const singleName=words.length===1&&words[0].length>=5&&fileWords.includes(words[0])&&
    fileWords.some(w=>['ship','vessel','ferry','tanker','cargo','boat','mv','ms'].includes(w));
  // A name alone is not sufficient for ambiguous ships; the single-word case
  // additionally requires clear vessel context in the file title.
  if(!sameName&&!sameImo&&!sameMmsi&&!singleName||
     fileWords.some(w=>['logo','model','drawing','illustration'].includes(w)))continue;
  const info=page.imageinfo?.[0],meta=info?.extmetadata;
  if(!info||!meta)continue;
  const license=plain(meta.LicenseShortName?.value);
  if(!/^(CC BY|CC0|Public domain|PD-)/i.test(license))continue;
  const src=info.thumburl||info.url,source=info.descriptionurl;
  if(!/^https:\/\/upload\.wikimedia\.org\//.test(src||'')||!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(source||''))continue;
  const lic=String(meta.LicenseUrl?.value||'');
  options.push({score:(sameImo?20:0)+(sameMmsi?15:0)+(sameName?8:0)+(singleName?3:0),photo:{src,source,license,confirmedId:sameImo||sameMmsi,
   licenseUrl:/^https:\/\/(creativecommons\.org|commons\.wikimedia\.org)\//.test(lic)?lic:source,
   credit:plain(meta.Artist?.value||meta.Credit?.value||info.user||'Se bildekilde')}});
 }
 return options.sort((a,b)=>b.score-a.score)[0]?.photo||null;
}
async function search(v){
 const name=String(v.name||'').trim(),key=String(v.mmsi||v.imo||name)+':'+name.toUpperCase();
 const cached=get(key);if(cached.hit)return cached.photo;
 if(pending.has(key))return pending.get(key);
 const task=(async()=>{
  try{
   const imo=String(v.imo||'').replace(/\D/g,'');
   const mmsi=String(v.mmsi||'').replace(/\D/g,'');
   const terms=[imo.length===7?'"'+imo+'"':'',
     mmsi.length===9?'"'+mmsi+'"':'',
     name.length>=5?'"'+name.replace(/"/g,'').slice(0,60)+'"':''].filter(Boolean);
   if(!terms.length)return null;
   let photo=null;
   for(const term of terms){
    const q=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',
     gsrsearch:term,gsrnamespace:'6',gsrlimit:'20',
     prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'720'});
    const r=await fetch('https://commons.wikimedia.org/w/api.php?'+q,{credentials:'omit',signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw Error('HTTP '+r.status);
    const j=await r.json();
    photo=pick(v,j.query?.pages);
    if(photo)break;
   }
   save(key,photo);return photo;
  }catch(e){console.warn('Fartøyfoto ikke tilgjengelig',e);return null;}
  finally{pending.delete(key);}
 })();
 pending.set(key,task);return task;
}
window.loadSelectedVesselPhoto=async function(v,identity){
 const photo=await search(v);
 if(!photo||document.getElementById('type-info')?.dataset.photoIdentity!==identity)return;
 const slot=document.getElementById('vessel-photo-slot'),fallback=document.getElementById('vessel-photo-fallback');
 const note=document.getElementById('vessel-photo-note');
 if(!slot||!fallback)return;
 const img=document.createElement('img');img.className='type-photo';img.loading='lazy';img.decoding='async';img.alt=(photo.confirmedId?'Foto av ':'Mulig foto av ')+String(v.name||'fartøy');
 img.onerror=()=>{slot.replaceChildren();fallback.hidden=false;if(note)note.textContent='Generell illustrasjon · foto kunne ikke lastes';};
 const wrap=document.createElement('div');wrap.className='type-photo-wrap';wrap.append(img);
 const credit=document.createElement('small');credit.className='type-credit';
 const by=document.createElement('a');by.href=photo.source;by.target='_blank';by.rel='noopener noreferrer';by.textContent=photo.credit||'Fotograf';
 const licence=document.createElement('a');licence.href=photo.licenseUrl;licence.target='_blank';licence.rel='noopener noreferrer';licence.textContent=photo.license;
 credit.append('Foto: ',by,' · ',licence,' · Wikimedia Commons');
 slot.replaceChildren(wrap,credit);fallback.hidden=true;
 if(note)note.textContent=(photo.confirmedId?'Foto knyttet til IMO/MMSI':'Mulig bilde funnet via skipsnavn')+' · Wikimedia Commons · AIS fra Kystverket';
 img.src=photo.src;
};
})();