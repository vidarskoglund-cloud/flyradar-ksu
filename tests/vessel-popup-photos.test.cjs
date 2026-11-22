const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const photos=fs.readFileSync(path.join(__dirname,'../vessel-photos.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('AIS vessel marker popup has an image slot and lazy photo loading',()=>{
 assert.match(app,/function vesselDetail\(v\)/);
 assert.match(app,/vessel-popup-photo-slot/);
 assert.match(app,/marker\.on\('popupopen'/);
 assert.match(app,/window\.loadVesselPopupPhoto\(current,event\.popup\.getElement\(\)\)/);
 assert.match(app,/if\(!marker\.isPopupOpen\(\)\)marker\.setPopupContent/);
});
test('AIS popup reuses strictly matched Commons photo search, safely attributed',()=>{
 assert.match(photos,/window\.loadVesselPopupPhoto=async function/);
 assert.match(photos,/const photo=await search\(v\)/);
 assert.match(photos,/host\.dataset\.vesselPhotoKey!==key/);
 assert.match(photos,/photo\.source/);
 assert.match(photos,/photo\.license/);
 assert.match(photos,/photo\.credit/);
 assert.match(photos,/photo\.confirmedId/);
 assert.match(photos,/if\(!photo\)/);
 assert.match(photos,/Se etter fartøybilder på Wikimedia Commons/);
 assert.match(photos,/^\s*const CACHE='kristiansund-vessel-photos-v4'/m);
});
test('popup fits the map and mobile view while avoiding additional AIS requests',()=>{
 assert.match(html,/vessel-popup-photo\{display:block;width:100%;max-height:130px/);
 assert.match(html,/vessel-photos\.js\?v=5/);
 assert.match(app,/\.bindPopup\(vesselDetail\(v\),\{autoPan:false\}\)/);
 assert.match(app,/setInterval\(loadVessels,30000\)/);
});
