(function(){
'use strict';
// Extra image lookups only for the aircraft shown in the detail panel.
// Do not infer that a type photo depicts the specific registered aircraft.
const CACHE='kristiansund-aircraft-photos-v2',pending=new Map();
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
  if(!/^(?:CC BY|CC0|PUBLIC DOMAIN|PD-)/i.test(licence)||/\b(?:NC|ND)\b/i.test(licence))continue;
  const src=info.thumburl||info.url,source=info.descriptionurl;
  if(!/^https:\/\/upload\.wikimedia\.org\//.test(src||'')||
     !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(source||''))continue;
  const url=String(meta.LicenseUrl?.value||'');
  candidates.push({src,source,license:licence,exact:true,
    licenseUrl:/^https:\/\/(?:creativecommons\.org|commons\.wikimedia\.org)\//.test(url)?url:source,
    credit:plain(meta.Artist?.value||meta.Credit?.value||info.user||'Se bildekilde')});
 }
 return candidates[0]||null;
}
// Representative type photos: strictly verify the aircraft model from the
// Commons title/categories, even where no exact registration photo exists.
const TYPE_SEARCH={
 GLF5:{terms:['"Gulfstream V" aircraft','"Gulfstream G-V"','"C-37A" aircraft'],patterns:[/\bgulfstream\s+(?:g[ -]?)?v\b/i,/\bglf5\b/i,/\bc[ -]?37a\b/i]},
 GLF6:{terms:['"Gulfstream G650" aircraft','"Gulfstream VI"'],patterns:[/\bgulfstream\s+(?:g[ -]?)?(?:vi|650)\b/i]},
 C130:{terms:['"Lockheed C-130 Hercules"'],patterns:[/\bc[ -]?130\b/i,/\bhercules\b/i]},
 C30J:{terms:['"KC-130J Hercules"'],patterns:[/\bkc[ -]?130j\b/i]},
 P8:{terms:['"Boeing P-8 Poseidon"'],patterns:[/\bp[ -]?8(?:a)?\b/i]},
 A400:{terms:['"Airbus A400M"'],patterns:[/\ba400m\b/i]},
 C17:{terms:['"Boeing C-17 Globemaster"'],patterns:[/\bc[ -]?17\b/i]},
 F35:{terms:['"F-35 Lightning II"'],patterns:[/\bf[ -]?35\b/i]},
 AW10:{terms:['"AgustaWestland AW101 helicopter"'],patterns:[/\b(?:aw[ -]?101|eh[ -]?101)\b/i]},
 S92:{terms:['"Sikorsky S-92 helicopter"'],patterns:[/\bs[ -]?92\b/i]},
 B738:{terms:['"Boeing 737-800"'],patterns:[/\b737[ -]?800\b/i]},
 DH8D:{terms:['"Dash 8 Q400"'],patterns:[/\b(?:q400|dash 8[ -]?400)\b/i]}
};
function chooseTypePhoto(type,pages){
 const spec=TYPE_SEARCH[String(type||'').toUpperCase()];
 if(!spec)return null;
 const matches=[];
 for(const page of Object.values(pages||{})){
  const filename=String(page.title||'').replace(/^File:/i,'');
  if(!/\.(?:jpe?g|webp)$/i.test(filename)||
    /\b(?:logo|drawing|illustration|render|model|diagram|cockpit|interior|seat|simulator)\b/i.test(filename))continue;
  // A broad Commons category may contain other Gulfstream variants.
  // Do not let a category override a conflicting model in the image filename.
  if(String(type).toUpperCase()==='GLF5'&&/gulfstream[ _-]+(?:g[ _-]?)?(?:iv|vi|550|650)\b/i.test(filename))continue;
  const categories=(page.categories||[]).map(c=>String(c.title||'').replace(/^Category:/i,'')).join(' ');
  const matchTitle=spec.patterns.some(rx=>rx.test(filename.replace(/_/g,' ')));
  const matchCategory=spec.patterns.some(rx=>rx.test(categories));
  if(!matchTitle&&!matchCategory)continue;
  const info=page.imageinfo?.[0],meta=info?.extmetadata;
  if(!info||!meta)continue;
  const license=plain(meta.LicenseShortName?.value);
  if(!/^(?:CC BY|CC0|PUBLIC DOMAIN|PD-)/i.test(license)||
      /\b(?:NC|ND)\b/i.test(license))continue;
  const src=info.thumburl||info.url,source=info.descriptionurl;
  if(!/^https:\/\/upload\.wikimedia\.org\//.test(src||'')||
    !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(source||''))continue;
  // Wikimedia photographs may depict another registration, never describe
  // these as photographs of the tracked aircraft.
  const licenseUrl=String(meta.LicenseUrl?.value||'');
  matches.push({score:(matchTitle?10:0)+(matchCategory?4:0),photo:{
    src,source,license,
    licenseUrl:/^https:\/\/(?:creativecommons\.org|commons\.wikimedia\.org)\//.test(licenseUrl)?licenseUrl:source,
    credit:plain(meta.Artist?.value||meta.Credit?.value||info.user||'Se bildekilde'),
    exact:false
  }});
 }
 return matches.sort((a,b)=>b.score-a.score)[0]?.photo||null;
}
async function lookupType(type){
 const key='type:'+String(type||'').toUpperCase();
 const spec=TYPE_SEARCH[String(type||'').toUpperCase()];
 if(!spec)return null;
 const saved=cacheRead(key);if(saved.hit)return saved.photo;
 if(pending.has(key))return pending.get(key);
 const task=(async()=>{
  let hadResponse=false;
  try{
   for(const term of spec.terms){
    const q=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',
      gsrsearch:term,gsrnamespace:'6',gsrlimit:'35',
      prop:'imageinfo|categories',cllimit:'max',iiprop:'url|extmetadata',iiurlwidth:'720'});
    const response=await fetch('https://commons.wikimedia.org/w/api.php?'+q,{
      credentials:'omit',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('HTTP '+response.status);
    hadResponse=true;
    const data=await response.json();
    const photo=chooseTypePhoto(type,data.query?.pages);
    if(photo){cacheWrite(key,photo);return photo;}
   }
   if(hadResponse)cacheWrite(key,null);
   return null;
  }catch(e){console.warn('Typefoto kunne ikke hentes',e);return null;}
  finally{pending.delete(key);}
 })();
 pending.set(key,task);return task;
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
 const code=String(plane?.type||'').trim().toUpperCase();
 const hasReg=/^[A-Z0-9]{1,3}-[A-Z0-9]{2,5}$/.test(reg);
 // Existing exact registration photos take precedence over representative
 // aircraft type photos. No name-only image is presented as an exact match.
 const photo=(hasReg?await lookup(reg):null)||(await lookupType(code));
 if(!photo||document.getElementById('type-info')?.dataset.photoIdentity!==identity)return;
 const slot=document.getElementById('aircraft-photo-slot');
 if(!slot)return;
 const img=document.createElement('img');
 img.className='type-photo';img.loading='lazy';img.decoding='async';
 img.alt=photo.exact?'Foto av fly '+reg:'Eksempelbilde av flytypen '+code;
 const wrap=document.createElement('div');wrap.className='type-photo-wrap';wrap.append(img);
 const credit=document.createElement('small');credit.className='type-credit';
 const by=document.createElement('a');by.href=photo.source;by.target='_blank';by.rel='noopener noreferrer';by.textContent=photo.credit||'Fotograf';
 const licence=document.createElement('a');licence.href=photo.licenseUrl;licence.target='_blank';licence.rel='noopener noreferrer';licence.textContent=photo.license;
 credit.append('Foto: ',by,' · ',licence,' · Wikimedia Commons');
 img.onerror=()=>{};
 img.onload=()=>{
  if(document.getElementById('type-info')?.dataset.photoIdentity!==identity)return;
  slot.replaceChildren(wrap,credit);
  const note=document.getElementById('aircraft-photo-note');
  if(note)note.textContent=photo.exact?'Foto av registrering '+reg:'Eksempelbilde av flytypen '+code+' – ikke nødvendigvis samme fly';
 };
 img.src=photo.src;
};
})();
