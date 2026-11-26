const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
test('immersive screen uses a full-height map instead of a split grid',()=>{
 assert.match(html,/Mobile immersive radar v2/);
 assert.match(html,/body\.radar-immersive #map\{[\s\S]*?height:100dvh!important/);
 assert.match(html,/body\.radar-immersive main\{[\s\S]*?display:block!important/);
 assert.match(html,/body\.radar-immersive \.nearest-panel\{[\s\S]*?position:fixed!important/);
});
test('selected target uses same existing detail card, in collapsible bottom sheet',()=>{
 assert.match(html,/id="immersive-sheet-handle"/);
 assert.match(html,/aria-expanded="false"/);
 assert.match(html,/id="immersive-sheet-content"/);
 assert.match(html,/id="cards"/);
 assert.match(html,/id="type-info"/);
 assert.match(html,/immersive-sheet-open/);
 assert.match(html,/MutationObserver\(syncSheet\)/);
 assert.match(html,/button\.textContent=enabled\?'Lukk kart':'Fullskjerm'/);
});
test('mobile fullscreen controller is syntactically valid and preserves exit',()=>{
 const begin=html.indexOf('/* Mobile\/tablet radar mode.');
 const end=html.indexOf('</script>',begin);
 assert.ok(begin>=0&&end>begin);
 assert.doesNotThrow(()=>new Function(html.slice(begin,end)));
 assert.match(html,/if\(e\.key==='Escape'&&state\(\)\)apply\(false\)/);
});
