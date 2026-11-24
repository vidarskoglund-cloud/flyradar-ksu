const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../map/traffic-notice-utils.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const context=vm.createContext({Date,Number,Intl,String});
vm.runInContext(source,context);

test('escape user-supplied notice text before insertion into map popup',()=>{
  assert.equal(context.safeTrafficText('<x&"\''),'&lt;x&amp;&quot;&#39;');
});
test('only active road closures receive closed status',()=>{
  assert.equal(context.trafficKind({message:'Vegen er stengt',validity:'active'}),'closed');
  assert.notEqual(context.trafficKind({message:'Vegen er stengt',validity:'expired'}),'closed');
});
test('road works and invalid dates retain established formatting',()=>{
  assert.equal(context.trafficKind({message:'veiarbeid',validity:'active'}),'work');
  assert.equal(context.formatDatexDate('n/a'),'n/a');
});
test('load helpers before app.js and avoid duplicate function declarations',()=>{
  const helper=page.indexOf('map/traffic-notice-utils.js?v=1');
  const main=page.indexOf('app.js?v=216');
  assert.ok(helper>=0 && main>helper);
  for(const fn of ['safeTrafficText','trafficKind','formatDatexDate']){
    assert.doesNotMatch(app,new RegExp('function '+fn+'\\s*\\('));
    assert.match(source,new RegExp('function '+fn+'\\s*\\('));
  }
});
