const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../police-status.js'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function harness({response,fail=false}={}){
 const list={children:[],replaceChildren(){this.children=[]},append(el){this.children.push(el)}};
 const stamp={textContent:''};
 const document={
  getElementById:id=>id==='police-incidents'?list:id==='police-update'?stamp:null,
  createElement:tag=>({tag,textContent:'',className:'',children:[],append(...items){this.children.push(...items)}})
 };
 let resolveRequest;const request=new Promise(resolve=>resolveRequest=resolve);
 const sandbox={document,Date,Intl,String,Number,Array,window:{},AbortController,
  fetch:async()=>{await request;if(fail)throw Error('unavailable');return {ok:true,json:async()=>response}},
  setInterval:()=>0,setTimeout:()=>0,clearTimeout:()=>{},console:{warn:()=>{}}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 return {list,stamp,settle:async()=>{resolveRequest();for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));}};
}
test('successful empty response reports no recent police messages',async()=>{
 const h=harness({response:{ok:true,incidents:[]}});await h.settle();
 assert.equal(h.list.children[0].textContent,'Ingen nye politimeldinger i området');
 assert.match(h.stamp.textContent,/Politiloggen/);
});
test('failure reports unavailable source, never falsely claims no messages',async()=>{
 const h=harness({fail:true});await h.settle();
 assert.equal(h.list.children[0].textContent,'Politiloggen er utilgjengelig akkurat nå');
 assert.equal(h.stamp.textContent,'Ikke oppdatert');
});
test('browser gets refreshed version of police status script',()=>{
 assert.match(page,/police-status\.js\?v=2/);
});
