import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import {validateContent,validateUploads,snapshot} from '../repository.mjs';

const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
const fixture={students:[{name:'試験用学生',name_en:'Test Student',role:'4年',role_en:'4th year',photo:'/images/16.jpg',photo_position:'top',bio:'紹介文',bio_en:'Biography'}],staff:[],alumni:[],news:[]};
async function screen(data=fixture){
 const nodes=new Map(),readers=[],saves=[];
 function node(id){if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',disabled:false,events:{},classList:{toggle(){}},addEventListener(type,handler){this.events[type]=handler;},querySelectorAll(){return [];},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);}
 class Reader{readAsDataURL(file){this.file=file;readers.push(this);}finish(value){this.result=value;this.onload();}}
 const context={structuredClone,crypto:{randomUUID},FileReader:Reader,window:{addEventListener(){}},location:{assign(){},reload(){}},document:{getElementById:node,querySelector:node,querySelectorAll:()=>[]},fetch:async(path,options)=>{
  if(path==='/api/state')return {ok:true,json:async()=>({data:structuredClone(data),head:'a'.repeat(40),branch:'main',csrf:'test',login:'test',repository:'test'})};
  if(path==='/api/save'){saves.push(JSON.parse(options.body));return {ok:true,json:async()=>({head:'b'.repeat(40)})};}
  throw Error('Unexpected request: '+path);
 }};
 await runInNewContext('(async()=>{'+source+'\n})()',context);
 const click=id=>node('form').events.click({target:{id}});
 const photo=()=>node('form').events.change({target:{id:'photo',files:[{type:'image/png',size:100}]}});
 const save=async()=>{click('save');for(let i=0;i<5;i++)await Promise.resolve();};
 const input=(field,value)=>node('form').events.input({target:{dataset:{field},value}});
 return {node,readers,saves,click,photo,save,input};
}
const png='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');

test('graduation preserves profile and newly selected photo through save and public HTML',async()=>{
 const ui=await screen();ui.photo();ui.readers[0].finish(png);
 ui.click('graduate');ui.node('cancel-confirm').onclick();assert.equal(ui.node('editor-title').textContent,'学生 (1)');
 ui.click('graduate');assert.equal(ui.node('do-confirm').textContent,'卒業生へ移動');ui.node('do-confirm').onclick();
 assert.equal(ui.node('editor-title').textContent,'卒業生 (1)');await ui.save();
 const payload=ui.saves[0];assert.equal(payload.data.students.length,0);assert.equal(payload.data.alumni.length,1);
 const member=payload.data.alumni[0];for(const key of ['name','name_en','bio','bio_en','photo_position'])assert.equal(member[key],fixture.students[0][key]);
 assert.equal(member.role,'卒業生');assert.equal(member.role_en,'Alumni');assert.equal(payload.uploads.length,1);assert.equal(member.photo,'/'+payload.uploads[0].path);
 const clean=validateContent(payload.data);assert.equal(validateUploads(payload.uploads,clean).length,1);
 const published=snapshot(html,clean);assert.ok(published.includes(member.photo));assert.ok(published.includes('Biography'));
});
test('out-of-order photo reads keep the latest choice and block save until all reads finish',async()=>{
 const ui=await screen();ui.photo();ui.photo();ui.readers[1].finish(png);await ui.save();assert.equal(ui.saves.length,0);
 assert.match(ui.node('status').textContent,/読み込み/);ui.readers[0].finish('data:image/png;base64,OLD');await ui.save();
 assert.equal(ui.saves.length,1);assert.equal(ui.saves[0].uploads.length,1);assert.equal(ui.saves[0].uploads[0].base64,png.split(',')[1]);
});
test('removing a photo while it loads does not restore it or upload unused bytes',async()=>{
 const ui=await screen();ui.photo();ui.click('remove-photo');ui.readers[0].finish(png);await ui.save();
 assert.equal(ui.saves[0].data.students[0].photo,'');assert.deepEqual(ui.saves[0].uploads,[]);
});
test('replacing a photo discards the unused upload and read errors release saving',async()=>{
 const ui=await screen();ui.photo();ui.readers[0].finish(png);ui.photo();ui.readers[1].finish(png);ui.photo();ui.readers[2].onerror();await ui.save();
 assert.equal(ui.saves.length,1);assert.equal(ui.saves[0].uploads.length,1);
});

test('students sort by descending year, keep ties stable, and retain all profiles',async()=>{
 const students=[['二年','2年'],['四年A','4年'],['未入力',''],['一年','1年'],['四年B','４年生'],['三年','学部3年']].map(([name,role])=>({...fixture.students[0],name,role}));
 const ui=await screen({...fixture,students});await ui.save();
 assert.deepEqual(ui.saves[0].data.students.map(x=>x.name),['四年A','四年B','三年','二年','一年','未入力']);
 for(const student of ui.saves[0].data.students)assert.deepEqual(student,students.find(x=>x.name===student.name));
});
test('new student sorts immediately after year input without switching the edited person',async()=>{
 const ui=await screen({...fixture,students:[{...fixture.students[0],role:'4年'},{...fixture.students[0],name:'一年生',role:'1年'}]});
 ui.node('add').events.click();ui.input('name','追加した学生');ui.input('role','2年');ui.input('bio','追加した人の紹介');await ui.save();
 assert.deepEqual(ui.saves[0].data.students.map(x=>x.name),['試験用学生','追加した学生','一年生']);
 assert.equal(ui.saves[0].data.students[1].bio,'追加した人の紹介');
 ui.input('role','4年');ui.input('name','同じ学生のまま');await ui.save();
 assert.deepEqual(ui.saves[1].data.students.map(x=>x.name),['試験用学生','同じ学生のまま','一年生']);
});
