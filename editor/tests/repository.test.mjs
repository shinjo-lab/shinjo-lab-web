import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateContent,validateUploads,snapshot,createRepositoryClient} from '../repository.mjs';
const data={};for(const g of ['students','staff','alumni','news'])data[g]=JSON.parse(await readFile(new URL('../../content/'+g+'.json',import.meta.url),'utf8')).items;
const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
test('valid content survives validation, missing names and unsafe links are rejected',()=>{
 assert.equal(validateContent(data).students.length,24);
 const missing=structuredClone(data);missing.students[0].name=' ';assert.throws(()=>validateContent(missing));
 const xss=structuredClone(data);xss.news[0].url='javascript:alert(1)';assert.throws(()=>validateContent(xss));
 const date=structuredClone(data);date.news[0].date='2026-02-31';assert.throws(()=>validateContent(date));
});
test('static snapshot replaces all managed records, including deletions and empty lists',()=>{
 const empty={students:[],staff:[],alumni:[],news:[]};const updated=snapshot(html,empty);
 assert.ok(!updated.includes(data.students[0].name));assert.ok(!updated.includes(data.news[0].title));
 assert.ok(updated.includes('id="cms-students"'));assert.ok(updated.includes('id="page-home"'));
 const inserted=structuredClone(empty);inserted.students=[{...data.students[0],name:'<img src=x onerror=alert(1)>'}];
 assert.ok(snapshot(html,inserted).includes('&lt;img'));assert.ok(!snapshot(html,inserted).includes('<img src=x'));
});
test('photo uploads require a used path, image signature, and size bound',()=>{
 const path='images/cms/12345678-1234-1234-1234-123456789012.png';
 const changed=structuredClone(data);changed.students[0].photo='/'+path;
 const file={path,base64:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')};
 assert.equal(validateUploads([file],changed).length,1);
 assert.throws(()=>validateUploads([{...file,base64:Buffer.from('<script>').toString('base64')}],changed));
 assert.throws(()=>validateUploads([{...file,path:'index.html'}],changed));
 assert.throws(()=>validateUploads([file],data));
});
test('concurrent edit conflicts are rejected before any Git write',async()=>{
 const calls=[];const client=createRepositoryClient('test-token','main',async(url,opts)=>{calls.push([url,opts]);return {ok:true,json:async()=>url.endsWith('/git/ref/heads/main')?{object:{sha:'b'.repeat(40)}}:{permissions:{push:true}}};});
 await assert.rejects(()=>client.save({head:'a'.repeat(40),data,uploads:[]}),e=>e.status===409);
 assert.ok(calls.every(([,opts])=>opts.method==='GET'));
});
test('read-only users cannot read editor state or save',async()=>{
 const client=createRepositoryClient('test-token','main',async()=>({ok:true,json:async()=>({permissions:{push:false}})}));
 await assert.rejects(()=>client.read(),e=>e.status===403);await assert.rejects(()=>client.save({head:'a'.repeat(40),data}),e=>e.status===403);
});
test('save commits JSON, static fallback, and photos together then fast-forwards branch',async()=>{
 const calls=[];const ref='a'.repeat(40);let entries;
 const client=createRepositoryClient('test-token','main',async(url,opts)=>{
  const path=new URL(url).pathname;calls.push([path,opts]);let result;
  if(path.endsWith('/git/ref/heads/main'))result={object:{sha:ref}};
  else if(path.endsWith('/git/commits/'+ref))result={tree:{sha:'old-tree'}};
  else if(path.endsWith('/contents/index.html'))result={encoding:'base64',content:Buffer.from(html).toString('base64')};
  else if(path.endsWith('/git/trees')){entries=JSON.parse(opts.body).tree;result={sha:'new-tree'};}
  else if(path.endsWith('/git/commits'))result={sha:'b'.repeat(40)};
  else if(path.endsWith('/git/refs/heads/main')){assert.equal(JSON.parse(opts.body).force,false);result={};}
  else result={permissions:{push:true}};
  return {ok:true,json:async()=>result};
 });
 const result=await client.save({head:ref,data,uploads:[]});assert.equal(result.head,'b'.repeat(40));
 assert.equal(entries.length,5);assert.ok(entries.some(x=>x.path==='index.html'));assert.ok(entries.some(x=>x.path==='content/students.json'));
 assert.equal(calls.at(-1)[1].method,'PATCH');
});
