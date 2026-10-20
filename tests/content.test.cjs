const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {member,article,safeUrl,validate,load} = require('../assets/content.js');
const root = path.join(__dirname,'..');
const read = group => JSON.parse(fs.readFileSync(path.join(root,`content/${group}.json`),'utf8'));

test('editable records remain consistent with public HTML as membership changes', () => {
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(!/<[^>]+\bid="[^"]*"[^>]+\bid=/.test(html),'HTML elements must not have two IDs');
  for (const group of ['staff','students','alumni','news']) {
    const items = validate(read(group),group);
    assert.equal(html.match(new RegExp(`id="cms-${group}"`,'g')).length,1);
    for (const item of items) {
      assert.ok(item[group === 'news' ? 'title' : 'name'].trim());
      assert.ok(html.includes(item[group === 'news' ? 'title' : 'name']));
      if (item.photo) assert.ok(safeUrl(item.photo,true),item.photo);
      if (group === 'news') {
        assert.ok(item.body); assert.ok(item.categories.length);
        assert.ok(!Number.isNaN(Date.parse(item.date)));
        assert.match(article(item),new RegExp(`data-category="${item.categories.join(' ')}"`));
      }
    }
  }
});
test('member photos and text cannot inject markup or executable URLs', () => {
  const result = member({name:'<script>alert(1)</script>',photo:'javascript:alert(1)',bio:'line 1\n<img onerror=alert(1)>'},'students');
  assert.ok(!result.includes('<script>')); assert.ok(!result.includes('src="javascript:'));
  assert.ok(result.includes('&lt;img')); assert.ok(result.includes('<br>'));
  assert.equal(safeUrl('//evil.test/photo.jpg',true),'');
  assert.equal(safeUrl('/images/../secret.png',true),'');
  assert.equal(safeUrl('data:image/svg+xml,unsafe',true),'');
  assert.equal(safeUrl('/images/test.jpg',true),'/images/test.jpg');
  assert.ok(member({name:'Name',photo:'/images/test.jpg',photo_position:'top'},'staff').includes('object-position:top'));
});
test('news without an external link renders full body; optional English falls back to Japanese', () => {
  const result = article({title:'日本語',body:'本文\n続き',date:'2026-10-19',categories:['news'],url:'javascript:alert(1)'});
  assert.match(result,/^<article /); assert.ok(result.includes('<span class="lang-en">日本語</span>'));
  assert.ok(result.includes('本文<br>続き')); assert.ok(result.includes('2026.10.19'));
  assert.ok(!result.includes('javascript:'));
  const linked = article({...read('news').items[0],url:'https://example.com/?q=" onmouseover="alert(1)'});
  assert.ok(linked.includes('rel="noopener noreferrer"')); assert.ok(linked.includes('&quot;'));
});
function documentStub() {
  const containers = Object.fromEntries(['staff','students','alumni','news'].map(g=>[g,{innerHTML:'fallback',querySelectorAll:()=>[]}])) ;
  return {containers,getElementById:id=>containers[id.replace('cms-','')],querySelector:()=>null};
}
test('add/edit/delete data refreshes each managed section; news sorts newest first', async () => {
  const doc = documentStub();
  await load(doc,async url => ({ok:true,json:async()=>url.includes('news') ? {items:[{title:'Old',date:'2020-01-01',categories:[]},{title:'New',date:'2026-01-01',categories:[]}]} : {items:[{name:'Added',role:'3年'}]}}));
  assert.ok(doc.containers.students.innerHTML.includes('Added'));
  assert.ok(doc.containers.news.innerHTML.indexOf('New') < doc.containers.news.innerHTML.indexOf('Old'));
  await load(doc,async()=>({ok:true,json:async()=>({items:[]})}));
  assert.equal(doc.containers.students.innerHTML,''); assert.equal(doc.containers.news.innerHTML,'');
});
test('failed or malformed requests keep existing content', async () => {
  const doc = documentStub(); const original = console.error; console.error=()=>{};
  try {
    await load(doc,async()=>({ok:false,status:404}));
    assert.equal(doc.containers.news.innerHTML,'fallback');
    await load(doc,async()=>({ok:true,json:async()=>({wrong:[]})}));
    assert.equal(doc.containers.students.innerHTML,'fallback');
  } finally {console.error=original;}
});
test('managed content keeps a consistent record schema', () => {
  for (const group of ['staff','students','alumni','news']) {
    const items=read(group).items;
    for (const item of items) assert.deepEqual(Object.keys(item).sort(),Object.keys(items[0]).sort());
  }
});
