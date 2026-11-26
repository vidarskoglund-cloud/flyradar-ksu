/* Private, local-only photo-to-AIS/ADS-B matching pilot. Nothing is uploaded. */
(()=>{
'use strict';
const root=document.getElementById('photo-identify');
if(!root)return;
const file=root.querySelector('#photo-id-file'),heading=root.querySelector('#photo-id-bearing');
const status=root.querySelector('#photo-id-status'),results=root.querySelector('#photo-id-results');
const clear=root.querySelector('#photo-id-clear'),latInput=root.querySelector('#photo-id-lat');
const lonInput=root.querySelector('#photo-id-lon');
let latest=null;
function say(s){status.textContent=s;}
function exifJpeg(buffer){
 const d=new DataView(buffer),limit=d.byteLength;
 if(limit<12||d.getUint16(0)!==0xffd8)throw Error('Velg JPEG-originalen fra iPhone. HEIC støttes ikke i første versjon.');
 let base=-1;
 for(let i=2;i+4<limit;){
  if(d.getUint8(i)!==0xff)break;
  const marker=d.getUint8(i+1),len=d.getUint16(i+2);
  if(len<2||i+2+len>limit)break;
  if(marker===0xe1&&len>=10&&
     d.getUint8(i+4)===69&&d.getUint8(i+5)===120&&d.getUint8(i+6)===105&&d.getUint8(i+7)===102){
   base=i+10;break;
  }
  i+=2+len;
 }
 if(base<0)throw Error('Fant ikke EXIF-data. Bruk originalfilen med posisjonsinformasjon.');
 const little=d.getUint16(base)===0x4949;
 if(!little&&d.getUint16(base)!==0x4d4d)throw Error('Ugyldige EXIF-data');
 const u16=o=>d.getUint16(base+o,little),u32=o=>d.getUint32(base+o,little);
 if(u16(2)!==42)throw Error('Ugyldig EXIF TIFF-data');
 const within=(o,n=1)=>o>=0&&base+o+n<=limit;
 function ifd(offset){
  if(!within(offset,2))return new Map();
  const count=u16(offset),m=new Map();
  if(count>500||!within(offset+2,count*12))return m;
  for(let j=0;j<count;j++){
   const e=offset+2+12*j,tag=u16(e),type=u16(e+2),n=u32(e+4),size={1:1,2:1,3:2,4:4,5:8,7:1,10:8}[type];
   if(!size||n>10000||size*n>100000)continue;
   const valueOffset=size*n<=4?e+8:u32(e+8);
   if(!within(valueOffset,n*size))continue;
   const read=k=>{
    const at=valueOffset+k*size;
    if(type===2)return d.getUint8(base+at);
    if(type===3)return u16(at);
    if(type===4)return u32(at);
    if(type===5||type===10){
     const numerator=type===10?d.getInt32(base+at,little):u32(at);
     const denominator=type===10?d.getInt32(base+at+4,little):u32(at+4);
     return denominator?numerator/denominator:NaN;
    }
    return d.getUint8(base+at);
   };
   let v;
   if(type===2){v=Array.from({length:n},(_,k)=>String.fromCharCode(read(k))).join('').replace(/\0.*$/,'');}
   else v=n===1?read(0):Array.from({length:n},(_,k)=>read(k));
   m.set(tag,v);
  }
  return m;
 }
 const main=ifd(u32(4)),gps=ifd(main.get(0x8825)||-1);
 const coord=(ref,val)=>{
  if(!Array.isArray(val)||val.length!==3||!val.every(Number.isFinite))return null;
  let x=val[0]+val[1]/60+val[2]/3600;
  if(ref==='S'||ref==='W')x=-x;
  return x;
 };
 const lat=coord(gps.get(1),gps.get(2)),lon=coord(gps.get(3),gps.get(4));
 const dir=Number(gps.get(0x11));
 const exif=ifd(main.get(0x8769)||-1),date=exif.get(0x9003)||main.get(0x132)||'';
 return {lat:Number.isFinite(lat)&&Math.abs(lat)<=90?lat:null,
  lon:Number.isFinite(lon)&&Math.abs(lon)<=180?lon:null,
  heading:Number.isFinite(dir)&&dir>=0&&dir<360?dir:null,
  date:String(date)};
}
function bearing(a,b,c,d){
 const r=Math.PI/180,y=Math.sin((d-b)*r)*Math.cos(c*r);
 const x=Math.cos(a*r)*Math.sin(c*r)-Math.sin(a*r)*Math.cos(c*r)*Math.cos((d-b)*r);
 return (Math.atan2(y,x)/r+360)%360;
}
function distanceKm(a,b,c,d){
 const r=Math.PI/180,dlat=(c-a)*r,dlon=(d-b)*r;
 const z=Math.sin(dlat/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(dlon/2)**2;
 return 12742*Math.atan2(Math.sqrt(z),Math.sqrt(Math.max(0,1-z)));
}
const angular=(a,b)=>Math.abs((a-b+540)%360-180);
function candidates(meta,observations){
 const range=observations.filter(o=>o.lat!=null&&o.lon!=null&&Number.isFinite(+o.lat)&&Number.isFinite(+o.lon)&&!o.stale);
 return range.map(o=>{
  const br=bearing(meta.lat,meta.lon,+o.lat,+o.lon);
  return {...o,br,km:distanceKm(meta.lat,meta.lon,+o.lat,+o.lon),difference:angular(br,meta.heading)};
 }).filter(x=>x.km<=100&&x.difference<=15).sort((a,b)=>a.difference-b.difference||a.km-b.km).slice(0,8);
}
function reset(){
 latest=null;file.value='';latInput.value='';lonInput.value='';heading.value='';
 results.replaceChildren();say('Ingen foto valgt. Ingenting lagres eller sendes til serveren.');
}
function row(item){
 const box=document.createElement('div');box.className='photo-match';
 const title=document.createElement('strong');title.textContent=(item.kind==='ship'?'Båt: ':'Fly: ')+item.name;
 const details=document.createElement('small');
 details.textContent='Peiling '+Math.round(item.br)+'° · avvik '+item.difference.toFixed(1)+'° · '+item.km.toFixed(1)+' km fra fotografen';
 box.append(title,details);return box;
}
function compare(){
 results.replaceChildren();
 if(!latest)return;
 const lat=Number(latInput.value),lon=Number(lonInput.value),dir=Number(heading.value);
 if(latInput.value.trim()===''||lonInput.value.trim()===''||heading.value.trim()===''||
    !Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||
    !Number.isFinite(dir)||dir<0||dir>=360){say('GPS-posisjon og kameraretning kreves for sammenligning. Du kan fylle inn manglende verdier manuelt.');return;}
 const snapshot=window.KsuPhotoCandidates?.();
 if(!snapshot||!Array.isArray(snapshot.items)){say('Trafikkdata er ikke tilgjengelige akkurat nå.');return;}
 // Never match an old photo to current positions: this needs timestamped history.
 const photoTime=latest.epoch;
 if(!Number.isFinite(photoTime)||Math.abs(snapshot.at-photoTime)>5*60*1000){
  say('Bildet er ikke tatt innen fem minutter fra gjeldende sporingsdata. Historiske AIS/ADS-B-posisjoner må bygges før vi kan identifisere objektet.');return;
 }
 const matches=candidates({lat,lon,heading:dir},snapshot.items);
 say(matches.length?'Mulige treff fra nylig mottatt AIS/ADS-B. Ikke bekreftet identifikasjon.':'Ingen sannsynlige treff innenfor ±15° og 100 km. Objektet kan mangle AIS/ADS-B.');
 matches.forEach(x=>results.append(row(x)));
}
file.addEventListener('change',async()=>{
 results.replaceChildren();latest=null;
 if(!file.files?.[0])return;
 const f=file.files[0];
 if(f.size>20*1024*1024){say('Maksimal filstørrelse er 20 MB.');return;}
 try{
  const e=exifJpeg(await f.arrayBuffer());
  if(e.lat!==null)latInput.value=e.lat.toFixed(6);
  if(e.lon!==null)lonInput.value=e.lon.toFixed(6);
  if(e.heading!==null)heading.value=String(Math.round(e.heading*10)/10);
  // EXIF local time lacks a reliable offset; do not silently assume UTC.
  const dt=e.date.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  const epoch=dt?new Date(+dt[1],+dt[2]-1,+dt[3],+dt[4],+dt[5],+dt[6]).getTime():NaN;
  latest={epoch};
  say('EXIF lest: '+(e.lat!==null?'GPS registrert':'GPS mangler')+', '+(e.heading!==null?'kameraretning registrert':'kameraretning mangler')+'. '+(e.date?'Bildetid: '+e.date+'. ':'')+'Ingen metadata lastes opp.');
 }catch(e){say(e.message||'Kunne ikke lese bildeinformasjonen.');}
});
root.querySelector('#photo-id-compare').addEventListener('click',compare);
clear.addEventListener('click',reset);
window.KsuPhotoIdentify={bearing,distanceKm,candidates,exifJpeg};
})();
