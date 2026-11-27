(function(){
'use strict';

/* User-confirmed aircraft identity: photographed at Kristiansund, 25 Nov 2026.
   Never key these photos to flight HKS463: callsigns can move between airframes.
   Photographs are matched by registration/ICAO and stored in the repo. */
const LOCAL_AIRCRAFT_GALLERIES=Object.freeze({
 '478057':{reg:'LN-OQU',files:[
  'images/aircraft/LN-OQU/IMG_1315.webp',
  'images/aircraft/LN-OQU/IMG_1316.webp',
  'images/aircraft/LN-OQU/IMG_1317.webp',
  'images/aircraft/LN-OQU/IMG_1318.webp',
  'images/aircraft/LN-OQU/IMG_1320.webp',
  'images/aircraft/LN-OQU/IMG_1362.webp',
  'images/aircraft/LN-OQU/IMG_1363.webp',
  'images/aircraft/LN-OQU/IMG_1364.webp'
 ]}
});
const localAircraftSlideTimers=new WeakMap();
function exactLocalAircraftGallery(plane){
 const hex=String(plane?.hex||plane?.icao24||plane?.icao||'').trim().toLowerCase().replace(/^~/,'');
 const reg=String(plane?.reg||'').trim().toUpperCase();
 const gallery=LOCAL_AIRCRAFT_GALLERIES['478057'];
 // Prefer ICAO-hex; deny inconsistent identities instead of mismatching photos.
 if(hex && hex!=='478057')return null;
 if(reg && reg!=='LN-OQU')return null;
 return hex==='478057'||reg==='LN-OQU'?gallery:null;
}
function showLocalAircraftGallery(plane,identity){
 const gallery=exactLocalAircraftGallery(plane);
 if(!gallery)return false;
 const slot=document.getElementById('aircraft-photo-slot');
 if(!slot)return false;
 const images=gallery.files;
 const wrap=document.createElement('div');wrap.className='type-photo-wrap aircraft-local-gallery';
 const img=document.createElement('img');
 img.className='type-photo';img.decoding='async';img.loading='eager';
 const credit=document.createElement('small');credit.className='type-credit';
 function updatePhotoCredit(){
  const newer=/IMG_136[234]\\.webp$/.test(images[index]);
  const date=newer?'27.11.2026':'25.11.2026';
  img.alt='LN-OQU · fotografert ved Kristiansund '+(newer?'27. november':'25. november')+' 2026';
  credit.textContent='Foto: lokalt fotografert · LN-OQU (ICAO 478057) · '+date;
 }
 wrap.append(img);
 let index=0,hasLoaded=false,stopped=false,timer=null;
 const active=()=>document.getElementById('type-info')?.dataset.photoIdentity===identity;
 function stop(){stopped=true;if(timer)clearInterval(timer);timer=null;}
 function next(){
  if(stopped||!active()){stop();return;}
  index=(index+1)%images.length;
  updatePhotoCredit();
  img.src=images[index];
 }
 img.addEventListener('load',()=>{
  if(!active()||stopped){stop();return;}
  if(!hasLoaded){
   hasLoaded=true;
   slot.replaceChildren(wrap,credit);
   timer=setInterval(next,5500);
   localAircraftSlideTimers.set(slot,stop);
  }
 });
 img.addEventListener('error',()=>{
  if(!hasLoaded){stop();return;} // Preserve standard photo fallback if local files have not been published.
  if(!active()){stop();return;}
  // Skip a missing picture but do not loop forever when the gallery is incomplete.
  const attempts=Number(img.dataset.failures||0)+1;
  img.dataset.failures=String(attempts);
  if(attempts>=images.length){stop();return;}
  next();
 });
 // Avoid stale timer on a card refresh.
 localAircraftSlideTimers.get(slot)?.();
 updatePhotoCredit();
 img.src=images[0];
 return true;
}

// Extra image lookups only for the aircraft shown in the detail panel.
// Do not infer that a type photo depicts the specific registered aircraft.
const CACHE='kristiansund-aircraft-photos-v5',pending=new Map();
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
  records[key]={photo,until:now+(photo?7*86400000:3*3600000)};
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
 S92:{terms:['Sikorsky S-92 CHC helicopter','Sikorsky S-92 Bristow','Sikorsky S-92 offshore','S-92 helicopter'],patterns:[/\bs[ -]?92\b/i]},
 B738:{terms:['Boeing 737-800 aircraft'],patterns:[/\b737[ -]?800\b/i]},
 A20N:{terms:['Airbus A320neo airliner'],patterns:[/\b(?:a320neo|a320-?251|a320-?271)\b/i]},
 A320:{terms:['Airbus A320 airliner'],patterns:[/\ba320\b/i]},
 A319:{terms:['Airbus A319 aircraft'],patterns:[/\ba319\b/i]},
 A321:{terms:['Airbus A321 aircraft'],patterns:[/\ba321\b/i]},
 B38M:{terms:['Boeing 737 MAX 8','Boeing 737-8 MAX','Boeing 737 MAX Ryanair'],patterns:[/\b(?:737[ -]?max[ -]?8|737[ -]?8[ -]?max|b38m|max[ -]?8|737[ -]?8200)\b/i]},
 E195:{terms:['Embraer E195 aircraft'],patterns:[/\b(?:e195|erj ?195|embraer 195)\b/i]},
 E190:{terms:['Embraer E190 aircraft'],patterns:[/\b(?:e190|erj ?190|embraer 190)\b/i]},
 E290:{terms:['Embraer E190 E2 aircraft'],patterns:[/\b(?:e190 ?e2|e190-?e2|erj ?190-?300)\b/i]},
 E295:{terms:['Embraer E195 E2 aircraft'],patterns:[/\b(?:e195 ?e2|e195-?e2|erj ?190-?400)\b/i]},
 DH8A:{terms:['Dash 8-100 aircraft'],patterns:[/\b(?:dash ?8[ -]?100|dhc[ -]?8[ -]?100)\b/i]},
 DH8C:{terms:['Dash 8-300 aircraft'],patterns:[/\b(?:dash ?8[ -]?300|dhc[ -]?8[ -]?300)\b/i]},
 A139:{terms:['AgustaWestland AW139 helicopter'],patterns:[/\b(?:aw ?139|a ?139)\b/i]},
 A189:{terms:['Leonardo AW189 helicopter'],patterns:[/\b(?:aw ?189|a ?189)\b/i]},
 H175:{terms:['Airbus H175 helicopter'],patterns:[/\b(?:h175|ec175)\b/i]},
 H145:{terms:['Airbus H145 helicopter'],patterns:[/\b(?:h145|ec145)\b/i]},
 S76:{terms:['Sikorsky S-76 helicopter'],patterns:[/\bs[ -]?76\b/i]},
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
  // Reject a conflicting model reference in filenames before trusting broad categories.
  const identityCodes=(filename.match(/\b(?:a319|a320|a321|e190|e195|e190[ -]?e2|e195[ -]?e2|737[ -]?800|737[ -]?max|q400|dash ?8[ -]?(?:100|300|400))\b/ig)||[]);
  if(identityCodes.length && !matchTitle && !['GLF5','GLF6','C130','C30J','P8','A400','C17','F35'].includes(String(type).toUpperCase()))continue;
  if(String(type).toUpperCase()==='S92'){
    // Offshore type examples must not default to military or tactical S-92s.
    const context=(filename+' '+categories).toLowerCase();
    if(/(?:military|army|navy|air force|presidential|marine one|vh-92|ch-148|cyclone|h-92|combat|tactical)/i.test(context))continue;
    if(!/(?:chc|bristow|offshore|helicopter services|civilian|commercial|oil|gas|s-92a)/i.test(context))continue;
  }
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
      gsrsearch:term,gsrnamespace:'6',gsrlimit:'50',
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
    gsrsearch:'"'+reg+'"',gsrnamespace:'6',gsrlimit:'50',
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
 // User-supplied LN-OQU photo files are now deployed on GitHub Pages.
 // Prefer their exact-airframe gallery over Wikimedia/type illustrations.
 const localGalleryRequested=showLocalAircraftGallery(plane,identity);
 if(localGalleryRequested)return;
 const reg=String(plane?.reg||'').trim().toUpperCase();
 const code=String(plane?.type||'').trim().toUpperCase();
 const hasReg=/^[A-Z0-9]{1,3}-[A-Z0-9]{2,5}$/.test(reg);
 // Existing exact registration photos take precedence over representative
 // aircraft type photos. No name-only image is presented as an exact match.
 const photo=(hasReg?await lookup(reg):null)||(await lookupType(code));
 if(!photo||document.getElementById('type-info')?.dataset.photoIdentity!==identity)return;
 // Allow locally photographed exact airframe images to take precedence.
 if(localGalleryRequested&&document.querySelector('#aircraft-photo-slot .aircraft-local-gallery'))return;
 const slot=document.getElementById('aircraft-photo-slot');
 if(!slot)return;
 const img=document.createElement('img');
 img.className='type-photo';img.loading='lazy';img.decoding='async';
 img.style.cssText='display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain';
 img.alt=photo.exact?'Foto av fly '+reg:'Eksempelbilde av flytypen '+code;
 const wrap=document.createElement('div');wrap.className='type-photo-wrap';
 wrap.style.cssText='height:92px;max-height:92px;min-height:0;overflow:hidden;contain:layout paint';
 wrap.append(img);
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
