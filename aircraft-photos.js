(function(){
'use strict';
// Extra image lookups only for the aircraft shown in the detail panel.
// Do not infer that a type photo depicts the specific registered aircraft.
const CACHE='kristiansund-aircraft-photos-v1',pending=new Map();
function cacheRead(key){
 try{
  const x=JSON.parse(localStorage.getItem(CACHE)||'{}')[key];
  return x&&x.until>Date.now()?{hit:true,photo:x.photo}:{hit:false};
 }catch(e){return {hit:false};}
}
function cacheWrite(key,photo){
 try{
  const records=JSON.parse(localStorage.getItem(CACHE)||'{}');
  const now=Date.now();
  for(const k of Object.keys(records))if(records[k].until<=now)delete records[k];
  records[key]={photo,until:now+(photo?7:1)*86400000};
  localStorage.setItem(CACHE,JSON.stringify(Object.fromEntries(Object.entries(records).slice(-80))));
 }catch(e){}
}
function plain(s){
 const div=document.createElement('div');div.innerHTML=String(s||'');
 return (div.textContent||'').trim().replace(/\s+/g,' ').slice(0,120);
}
function chooseExactRegistration(reg,pages){
 const candidates=[];
 const normalized=reg.toUpperCase().replace(/[^A-Z0-9]/g,'');
 for(const page of Object.values(pages||{})){
  const file=String(page.title||'').replace(/^File:/i,'');
  if(!/\.(?:jpe?g|webp)$/i.test(file))continue;
  const upper=file.toUpperCase();
  // Require the aircraft registration as a discrete token, with optional hyphen/space.
  const tokens=upper.match(/[A-Z0-9]+/g)||[];
  const exact=(tokens.includes(reg.toUpperCase())||
    tokens.some((_,i)=>tokens.slice(i,i+2).join('')===normalized));
  if(!exact)continue;
  if(/(?:ILLUSTRATION|DRAWING|MODEL|LOGO|SCREENSHOT)/i.test(file))continue;
  const info=page.imageinfo?.[0],meta=info?.extmetadata;
  if(!info||!meta)continue;
  const licence=plain(meta.LicenseShortName?.value);
  if(!/^(?:CC BY|CC0|PUBLIC DOMAIN|PD-)/i.test(licence))continue;
  const src=info.thumburl||info.url,source=info.descriptionurl;
  if(!/^https:\/\/upload\.wikimedia\.org\//.test(src||'')||
     !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(source||''))continue;
  const url=String(meta.LicenseUrl?.value||'');
  candidates.push({src,source,license:licence,
    licenseUrl:/^https:\/\/(?:creativecommons\.org|commons\.wikimedia\.org)\//.test(url)?url:source,
    credit:plain(meta.Artist?.value||meta.Credit?.value||info.user||'Se bildekilde')});
 }
 return candidates[0]||null;
}
async function lookup(reg){
 const saved=cacheRead(reg);if(saved.hit)return saved.photo;
 if(pending.has(reg))return pending.get(reg);
 const task=(async()=>{
  try{
   const q=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',
    gsrsearch:'"'+reg+'"',gsrnamespace:'6',gsrlimit:'20',
    prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'720'});
   const r=await fetch('https://commons.wikimedia.org/w/api.php?'+q,{credentials:'omit',signal:AbortSignal.timeout(8000)});
   if(!r.ok)throw new Error('HTTP '+r.status);
   const data=await r.json(),photo=chooseExactRegistration(reg,data.query?.pages);
   cacheWrite(reg,photo);return photo;
  }catch(e){console.warn('Flyfoto kunne ikke hentes',e);return null;}
  finally{pending.delete(reg);}
 })();
 pending.set(reg,task);return task;
}
window.loadSelectedAircraftPhoto=async function(plane,identity){
 const reg=String(plane?.reg||'').trim().toUpperCase();
 if(!/^[A-Z0-9]{1,3}-[A-Z0-9]{2,5}$/.test(reg))return;
 const photo=await lookup(reg);
 if(!photo||document.getElementById('type-info')?.dataset.photoIdentity!==identity)return;
 const slot=document.getElementById('aircraft-photo-slot');
 if(!slot)return;
 const img=document.createElement('img');
 img.className='type-photo';img.loading='lazy';img.decoding='async';img.alt='Fotografi av fly '+reg;
 const wrap=document.createElement('div');wrap.className='type-photo-wrap';wrap.append(img);
 const credit=document.createElement('small');credit.className='type-credit';
 const by=document.createElement('a');by.href=photo.source;by.target='_blank';by.rel='noopener noreferrer';by.textContent=photo.credit||'Fotograf';
 const licence=document.createElement('a');licence.href=photo.licenseUrl;licence.target='_blank';licence.rel='noopener noreferrer';licence.textContent=photo.license;
 credit.append('Foto: ',by,' · ',licence,' · Wikimedia Commons');
 img.onerror=()=>{};
 // Retain the known type photograph or illustration until exact-match photo loads.
 img.onload=()=>{
  if(document.getElementById('type-info')?.dataset.photoIdentity!==identity)return;
  slot.replaceChildren(wrap,credit);
  const note=document.getElementById('aircraft-photo-note');
  if(note)note.textContent='Foto av registrering '+reg;
 };
 img.src=photo.src;
};
})();