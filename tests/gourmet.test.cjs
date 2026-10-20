const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const position=html.indexOf('const SUPABASE_URL');
const start=html.indexOf('>',html.lastIndexOf('<script',position))+1;
const script=html.slice(start,html.indexOf('</script>',start))
 .replace(/const SUPABASE_URL\s*=\s*'[^']+';/,"const SUPABASE_URL = 'https://example.test';")
 .replace(/const SUPABASE_KEY\s*=\s*(["'])[^"']+\1;/,"const SUPABASE_KEY = 'public-test-key';");
const store=id=>({id,hidden:false,textContent:'',innerHTML:'',value:'',style:{},classList:{toggle(){}},addEventListener(){}});
function harness(fetcher){
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,store(id));return nodes.get(id);};
 let renders=0;
 const context=vm.createContext({document:{getElementById:get,querySelectorAll:()=>[]},fetch:fetcher,AbortController,
  setTimeout:(fn,ms)=>setTimeout(fn,ms===1000?0:ms),clearTimeout,console:{log(){},error(){}},alert(){},confirm(){return false;}});
 new vm.Script(script).runInContext(context);
 context.gRenderAll=()=>{renders++;const n=vm.runInContext('gRestaurants.length',context);get('g-stat-total').textContent=n;get('g-no-results').style.display=n?'none':'block';};
 return {context,get,load:()=>context.gLoadFromSheet(),restaurants:()=>JSON.parse(vm.runInContext('JSON.stringify(gRestaurants)',context)),renders:()=>renders};
}
const response=(rows,status=200)=>({ok:status>=200&&status<300,status,json:async()=>rows});
const row=(id,name='試験用店舗')=>({id,name,recommender:'試験用推薦者',pref:'東京都',scenes:[],reasons:[],photos:[],comments:[]});

test('initial network failure is shown as failure, not a confirmed zero restaurants',async()=>{
 let attempts=0;const ui=harness(async()=>{attempts++;throw Error('DNS failure');});await ui.load();
 assert.equal(attempts,2);assert.equal(ui.get('g-stat-total').textContent,'—');
 assert.equal(ui.get('g-no-results').style.display,'none');assert.match(ui.get('g-sync-status').textContent,/0件と確定したわけではありません/);
});
test('failed refresh retains the last successful list and does not render an empty replacement',async()=>{
 let failure=false;const ui=harness(async()=>failure?response({},503):response([row(1)]));await ui.load();const renders=ui.renders();failure=true;await ui.load();
 assert.equal(ui.restaurants().length,1);assert.equal(ui.renders(),renders);assert.match(ui.get('g-sync-status').textContent,/前回読み込んだ一覧/);
});
test('temporary server error retries once and recovers',async()=>{
 let attempts=0;const ui=harness(async()=>++attempts===1?response({},503):response([row(1)]));await ui.load();
 assert.equal(attempts,2);assert.equal(ui.restaurants().length,1);assert.equal(ui.get('g-sync-status').hidden,true);
});
test('actual empty data is accepted, while authorization errors are not retried or leaked',async()=>{
 const empty=harness(async()=>response([]));await empty.load();assert.equal(empty.get('g-stat-total').textContent,0);assert.equal(empty.get('g-no-results').style.display,'block');
 let attempts=0;const denied=harness(async()=>{attempts++;return response({message:'public-test-key'},401);});await denied.load();
 assert.equal(attempts,1);assert.match(denied.get('g-sync-status').textContent,/HTTP 401/);assert.ok(!denied.get('g-sync-status').textContent.includes('public-test-key'));
});
test('older overlapping requests cannot overwrite a newer refresh',async()=>{
 let resolveOld,calls=0;const ui=harness(()=>++calls===1?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve(response([row(2,'新しい店舗')])));
 const old=ui.load();await ui.load();resolveOld(response([row(1,'古い店舗')]));await old;assert.equal(ui.restaurants()[0].name,'新しい店舗');
});
test('missing optional data is normalized instead of crashing the entire restaurant list',async()=>{
 const ui=harness(async()=>response([{id:'1',name:'店舗',recommender:null,scenes:null,reasons:'invalid',photos:null,comments:[null,{id:'comment',name:null,text:null}]}]));await ui.load();
 const item=ui.restaurants()[0];assert.equal(item.id,1);assert.equal(item.recommender,'推薦者未設定');assert.deepEqual(item.scenes,[]);assert.equal(item.comments[0].name,'匿名');
});
test('malformed data does not erase a previously successful list',async()=>{
 let invalid=false;const ui=harness(async()=>response(invalid?{error:'invalid'}:[row(1)]));await ui.load();invalid=true;await ui.load();assert.equal(ui.restaurants().length,1);
});
test('requests have a timeout and stop after two attempts',async()=>{
 let attempts=0;const ui=harness((url,options)=>new Promise((resolve,reject)=>{attempts++;options.signal.addEventListener('abort',()=>reject(Error('timeout')));}));
 await assert.rejects(()=>ui.context.gFetchRestaurants(2));assert.equal(attempts,2);
});
test('refreshed dropdown selections remain visible and stale selections are cleared',async()=>{
 const ui=harness(async()=>response([row(1)]));await ui.load();
 vm.runInContext("gActiveFilters.pref='東京都';gActiveFilters.recommender='試験用推薦者';gRenderDropdownFilters();",ui.context);
 assert.equal(ui.get('g-filter-pref').value,'東京都');assert.equal(ui.get('g-filter-recommender').value,'試験用推薦者');
 vm.runInContext("gActiveFilters.pref='存在しない県';gRenderDropdownFilters();",ui.context);assert.equal(ui.get('g-filter-pref').value,'');
});
