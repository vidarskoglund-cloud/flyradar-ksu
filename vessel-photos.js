(function(){
'use strict';
const CACHE='kristiansund-vessel-photos-v8', pending=new Map();
const photoErrors=new Map();
// Source-verified Commons file titles, bound to a specific AIS identity.
// A title is only a lookup hint: each image still passes the license and identity checks.
const VERIFIED_FILE_HINTS={
 '257982900:ANGVIK':['File:Sundbåten angvik.JPG','File:SundbåtenAngvik2018.jpg']
};
function photoStatus(key){return photoErrors.get(key)||'';}
function vesselPhotoKey(v){return [String(v.mmsi||''),String(v.imo||''),String(v.name||'').toUpperCase()].join(':');}
function get(key){
 try{const item=JSON.parse(localStorage.getItem(CACHE)||'{}')[key];return item&&item.until>Date.now()?{hit:true,photo:item.photo}:{hit:false};}catch(e){return {hit:false};}
}
function save(key,photo){
 try{
  const now=Date.now(),raw=JSON.parse(localStorage.getItem(CACHE)||'{}'),items=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  for(const k of Object.keys(items))if(!items[k]||items[k].until<=now)delete items[k];
  items[key]={photo,until:now+(photo?7*86400000:3*3600000)};
  localStorage.setItem(CACHE,JSON.stringify(Object.fromEntries(Object.entries(items).slice(-100))));
 }catch(e){}
}
function plain(value){
 const d=document.createElement('div');d.innerHTML=String(value||'');
 return (d.textContent||'').trim().replace(/\s+/g,' ').slice(0,125);
}
function vesselWords(value){
 return String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
   .replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
}
function hasWords(haystack,words){
 const all=vesselWords(haystack);
 return Boolean(words.length)&&words.every(w=>all.includes(w));
}
function strictlyIdentifiedFerry(v){
 return String(v?.mmsi||'').trim()==='257087420'||
        String(v?.imo||'').trim()==='9855393'||
        String(v?.name||'').trim().toUpperCase()==='TUSTNA';
}
function pick(v,pages){
 const words=vesselWords(v.name).filter(w=>w.length>=3);
 const imo=String(v.imo||'').replace(/\D/g,'');
 const mmsi=String(v.mmsi||'').replace(/\D/g,'');
 if(!words.length&&imo.length!==7&&mmsi.length!==9)return null;
 const options=[];
 for(const page of Object.values(pages||{})){
  const filename=String(page.title||'').replace(/^File:/i,'');
  if(!/\.(jpe?g|webp|png)$/i.test(filename))continue;
  const fileWords=vesselWords(filename);
  if(fileWords.some(w=>['logo','model','drawing','illustration','render','plan','diagram'].includes(w)))continue;
  const info=page.imageinfo?.[0],meta=info?.extmetadata;
  if(!info||!meta)continue;
  const license=plain(meta.LicenseShortName?.value);
  if(!/^(CC BY|CC0|Public domain|PD-)/i.test(license)||/\b(?:NC|ND)\b/i.test(license))continue;
  const src=info.thumburl||info.url,source=info.descriptionurl;
  if(!/^https:\/\/upload\.wikimedia\.org\//.test(src||'')||!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(source||''))continue;
  const categories=(page.categories||[]).map(x=>String(x.title||'').replace(/^Category:/i,'')).join(' ');
  const description=plain(meta.ImageDescription?.value||'');
  const titleName=words.length&&hasWords(filename,words);
  const categoryName=words.length&&hasWords(categories,words);
  const descriptionName=words.length&&hasWords(description,words);
  const sameImo=imo.length===7&&hasWords(filename+' '+categories+' '+description,[imo]);
  const sameMmsi=mmsi.length===9&&hasWords(filename+' '+categories+' '+description,[mmsi]);
  // A ship's name alone (e.g. a fjord name) may describe a landscape.
  // Require a second maritime signal from filename, category or description.
  const maritime=/\b(ship|ships|vessel|vessels|ferry|ferger|ferge|ferja|cargo|tanker|boat|boats|pilot|losbat|losbat|losbåt|pilotboat|tugboat|tug|fishing|fiskebat|cruise|mv|ms|mf|skip|skipsfoto|supply|offshore)\b/i
    .test(vesselWords(filename+' '+categories+' '+description).join(' '));
  const nameMatch=titleName||categoryName||descriptionName;
  const supportedName=nameMatch&&maritime;
  // "Tustna" is also a place name. A photo of a small local boat
  // must not be presented as the TUSTNA ferry just because it mentions the place.
  if(strictlyIdentifiedFerry(v)&&!sameImo&&!sameMmsi)continue;
  if(!sameImo&&!sameMmsi&&!supportedName)continue;
  const lic=String(meta.LicenseUrl?.value||'');
  options.push({score:(sameImo?100:0)+(sameMmsi?90:0)+(titleName?20:0)+(categoryName?16:0)+(descriptionName?8:0)+(maritime?5:0),photo:{
   src,source,license,confirmedId:sameImo||sameMmsi,
   licenseUrl:/^https:\/\/(creativecommons\.org|commons\.wikimedia\.org)\//.test(lic)?lic:source,
   credit:plain(meta.Artist?.value||meta.Credit?.value||info.user||'Se bildekilde')}});
 }
 return options.sort((a,b)=>b.score-a.score)[0]?.photo||null;
}
async function search(v){
 const name=String(v.name||'').trim(),key=vesselPhotoKey(v);
 const cached=get(key);if(cached.hit)return cached.photo;
 if(pending.has(key))return pending.get(key);
 const task=(async()=>{
  try{
   photoErrors.delete(key);
   const imo=String(v.imo||'').replace(/\D/g,'');
   const mmsi=String(v.mmsi||'').replace(/\D/g,'');
   const cleanName=name.replace(/"/g,'').slice(0,60).trim();
   const knownFiles=VERIFIED_FILE_HINTS[mmsi+':'+name.toUpperCase()]||[];
   if(knownFiles.length){
    const q=new URLSearchParams({action:'query',format:'json',origin:'*',
      titles:knownFiles.join('|'),prop:'imageinfo|categories',cllimit:'max',
      iiprop:'url|extmetadata',iiurlwidth:'720'});
    try{
     const response=await fetch('https://commons.wikimedia.org/w/api.php?'+q,
      {credentials:'omit',signal:AbortSignal.timeout(8000)});
     if(response.ok){
      const json=await response.json();
      const verified=pick(v,json.query?.pages);
      if(verified){photoErrors.delete(key);save(key,verified);return verified;}
     }
    }catch(e){console.warn('Kunne ikke kontrollere kjente Commons-filer',e);}
   }
   const terms=[imo.length===7?'"'+imo+'"':'',
     mmsi.length===9?'"'+mmsi+'"':'',
     cleanName.length>=5?'"'+cleanName+'" ship':'',
     cleanName.length>=5?'"'+cleanName+'" vessel':'',
     cleanName.length>=5?'"'+cleanName+'"':'',
     cleanName.length>=4?cleanName+' ship photo':'',
     cleanName.length>=4?cleanName+' boat vessel':''].filter(Boolean);
   if(!terms.length)return null;
   let photo=null;
   for(const term of terms.slice(0,5)){
    const q=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',
     gsrsearch:term,gsrnamespace:'6',gsrlimit:'50',
     prop:'imageinfo|categories',cllimit:'max',iiprop:'url|extmetadata',iiurlwidth:'720'});
    const r=await fetch('https://commons.wikimedia.org/w/api.php?'+q,{credentials:'omit',signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw Error('HTTP '+r.status);
    const j=await r.json();
    photo=pick(v,j.query?.pages);
    if(photo)break;
   }
   photoErrors.delete(key);
   save(key,photo);return photo;
  }catch(e){
   photoErrors.set(key,'Oppslag mot Wikimedia Commons feilet · prøv igjen senere');
   console.warn('Fartøyfoto ikke tilgjengelig',e);return null;
  }
  finally{pending.delete(key);}
 })();
 pending.set(key,task);return task;
}
// A representative Commons photograph is shown only when its vessel category
// is reasonably verifiable. This is NEVER labelled as the tracked vessel.
const TYPE_PHOTOS=[
 {id:'pilot',test:v=>/^(?:LOS[ -]?\d+|PILOT\b|LOSB[AÅ]T)/i.test(String(v.name||'')),
  terms:['pilot boat at sea','pilot vessel boat'],
  match:/\b(?:pilot[ -]?boat|pilot[ -]?vessel|pilotbåt|losbåt|pilot[ -]?cutter)\b/i},
 {id:'passenger',test:v=>Number(v.shipType)>=60&&Number(v.shipType)<=69,
  terms:['passenger ferry ship at sea'],
  match:/\b(?:passenger[ -]?ship|passenger[ -]?ferry|ferryboat|car ferry|ferge)\b/i},
 {id:'cargo',test:v=>Number(v.shipType)>=70&&Number(v.shipType)<=79,
  terms:['cargo ship underway'],
  match:/\b(?:cargo[ -]?ship|freighter|bulk[ -]?carrier|general cargo)\b/i}
];
async function lookupRepresentative(v){
 // For a named routine ferry, show the neutral icon rather than a misleading
 // generic boat photograph if no identity-verified image is available.
 if(strictlyIdentifiedFerry(v))return null;
 const spec=TYPE_PHOTOS.find(x=>x.test(v));
 if(!spec)return null;
 const saved=get('type:'+spec.id);
 if(saved.hit)return saved.photo;
 for(const term of spec.terms){
  try{
   const q=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',
    gsrsearch:term,gsrnamespace:'6',gsrlimit:'35',
    prop:'imageinfo|categories',cllimit:'max',iiprop:'url|extmetadata',iiurlwidth:'720'});
   const r=await fetch('https://commons.wikimedia.org/w/api.php?'+q,
    {credentials:'omit',signal:AbortSignal.timeout(9000)});
   if(!r.ok)continue;
   const data=await r.json();
   for(const page of Object.values(data.query?.pages||{})){
    const filename=String(page.title||'').replace(/^File:/i,'');
    if(!/\.(?:jpe?g|webp)$/i.test(filename)||/\b(?:logo|drawing|render|model|diagram|illustration)\b/i.test(filename))continue;
    const categories=(page.categories||[]).map(c=>String(c.title||'').replace(/^Category:/i,'')).join(' ');
    if(!spec.match.test(filename.replace(/_/g,' ')+' '+categories))continue;
    const info=page.imageinfo?.[0],meta=info?.extmetadata;
    if(!info||!meta)continue;
    const license=plain(meta.LicenseShortName?.value);
    if(!/^(?:CC BY|CC0|Public domain|PD-)/i.test(license)||/\b(?:NC|ND)\b/i.test(license))continue;
    const src=info.thumburl||info.url,source=info.descriptionurl;
    if(!/^https:\/\/upload\.wikimedia\.org\//.test(src||'')||
       !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(source||''))continue;
    const lic=String(meta.LicenseUrl?.value||'');
    const photo={src,source,license,confirmedId:false,representative:true,
      licenseUrl:/^https:\/\/(?:creativecommons\.org|commons\.wikimedia\.org)\//.test(lic)?lic:source,
      credit:plain(meta.Artist?.value||meta.Credit?.value||info.user||'Se bildekilde')};
    save('type:'+spec.id,photo);return photo;
   }
  }catch(e){console.warn('Representativt skipsfoto kunne ikke hentes',e);}
 }
 // Short negative caching only: newly uploaded photos can become available.
 save('type:'+spec.id,null);
 return null;
}

// Reuse the same ID/name-checked, license-filtered Commons lookup in
// Leaflet popups. Do not substitute generic ship pictures for a named vessel.
window.loadVesselPopupPhoto=async function(v,popupElement){
 const host=popupElement?.querySelector('.vessel-popup-photo-slot');
 if(!host)return;
 const key=String(v.mmsi||v.name||'').trim();
 if(host.dataset.vesselPhotoKey!==key)return;
 const photo=(await search(v))||(await lookupRepresentative(v));
 if(!host.isConnected||host.dataset.vesselPhotoKey!==key)return;
 host.replaceChildren();
 if(!photo){
  const link=document.createElement('a');
  link.href='https://commons.wikimedia.org/w/index.php?search='+encodeURIComponent(String(v.name||'')+' ship')+'&title=Special:MediaSearch&type=image';
  link.target='_blank';link.rel='noopener noreferrer';
  link.textContent=photoStatus(vesselPhotoKey(v))||
    'Se etter fartøybilder på Wikimedia Commons';
  host.append(link);
  return;
 }
 const link=document.createElement('a');
 link.href=photo.source;link.target='_blank';link.rel='noopener noreferrer';
 link.className='vessel-popup-photo-link';
 const img=document.createElement('img');
 img.src=photo.src;
 img.alt=photo.representative?'Typebilde av tilsvarende fartøy':(photo.confirmedId?'Foto av ':'Mulig foto av ')+String(v.name||'fartøy');
 img.loading='lazy';img.decoding='async';
 img.className='vessel-popup-photo';
 img.onerror=()=>{
  if(host.isConnected){host.replaceChildren();host.textContent='Bilde kunne ikke lastes';}
 };
 link.append(img);
 const credit=document.createElement('small');
 credit.className='vessel-popup-photo-credit';
 credit.textContent=(photo.representative?'Typebilde – ikke samme skip':photo.confirmedId?'Identifisert med IMO/MMSI':'Bilde funnet via skipsnavn')+
   ' · '+(photo.credit||'Fotograf')+' · '+photo.license+' · Wikimedia Commons';
 host.append(link,credit);
};
window.loadSelectedVesselPhoto=async function(v,identity){
 const photo=(await search(v))||(await lookupRepresentative(v));
 if(document.getElementById('type-info')?.dataset.photoIdentity!==identity)return;
 if(!photo){
   const note=document.getElementById('vessel-photo-note');
   if(note)note.textContent=photoStatus(vesselPhotoKey(v))||
     'Fant ikke et sikkert skipsfoto i Wikimedia Commons · viser illustrasjon';
   return;
 }
 const slot=document.getElementById('vessel-photo-slot'),fallback=document.getElementById('vessel-photo-fallback');
 const note=document.getElementById('vessel-photo-note');
 if(!slot||!fallback)return;
 const img=document.createElement('img');img.className='type-photo';img.loading='eager';img.decoding='async';img.alt=photo.representative?'Typebilde av tilsvarende fartøy':(photo.confirmedId?'Foto av ':'Mulig foto av ')+String(v.name||'fartøy');
 const wrap=document.createElement('div');wrap.className='type-photo-wrap';wrap.append(img);
 // A lazy image detached from the DOM may never load, so attach it before src.
 // Keep the illustration visible while the real image is loading.
 wrap.hidden=true;
 slot.replaceChildren(wrap);
 const credit=document.createElement('small');credit.className='type-credit';
 const by=document.createElement('a');by.href=photo.source;by.target='_blank';by.rel='noopener noreferrer';by.textContent=photo.credit||'Fotograf';
 const licence=document.createElement('a');licence.href=photo.licenseUrl;licence.target='_blank';licence.rel='noopener noreferrer';licence.textContent=photo.license;
 credit.append('Foto: ',by,' · ',licence,' · Wikimedia Commons');
 img.onload=()=>{
   if(document.getElementById('type-info')?.dataset.photoIdentity!==identity)return;
   wrap.hidden=false;slot.append(credit);fallback.hidden=true;
   if(note)note.textContent=(photo.representative?'Typebilde – ikke samme skip':photo.confirmedId?'Foto knyttet til IMO/MMSI':'Mulig bilde funnet via skipsnavn')+' · Wikimedia Commons · AIS fra Kystverket';
 };
 img.onerror=()=>{
   if(document.getElementById('type-info')?.dataset.photoIdentity!==identity)return;
   slot.replaceChildren();fallback.hidden=false;
   if(note)note.textContent='Generell illustrasjon · foto kunne ikke lastes';
 };
 img.src=photo.src;
};
})();