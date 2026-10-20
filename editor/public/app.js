let state;
try {
 const response=await fetch('/api/state');
 const result=await response.json();
 if(!response.ok){if(response.status===401)location.assign('/login');throw new Error(result.error||'読み込みに失敗しました。');}
 state=result;
} catch(error) { document.getElementById('connection-notice').textContent=error.message; throw error; }
let data=structuredClone(state.data),group='students',selected=0,language='ja',pendingAction=null,dirty=false,saving=false,readingPhoto=0;
const photoPreviews=new Map(),uploads=new Map(),photoReads=new WeakMap();
const labels={students:'学生',staff:'教員・スタッフ',alumni:'卒業生',news:'ニュース'},enLabels={students:'Students',staff:'Faculty / Staff',alumni:'Alumni Spotlight',news:'News'},cats={news:['お知らせ','News'],media:['メディア','Media'],publication:['論文・発表','Publication'],project:['プロジェクト','Project']};
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function value(item,jp,en){return language==='en'?(item[en]||item[jp]||''):(item[jp]||'');}
function imageUrl(src){if(photoPreviews.has(src))return photoPreviews.get(src);if(/^\/images\/[\w./% -]+$/i.test(src||''))return 'https://shinjo-lab.com'+src;return '';}
function current(){return data[group][selected];}
function studentGrade(item){const match=String(item.role||'').normalize('NFKC').match(/^\s*(?:学部\s*)?([1-6])\s*年/);return match?Number(match[1]):0;}
function sortStudents(member){data.students.sort((a,b)=>studentGrade(b)-studentGrade(a));if(member&&group==='students')selected=data.students.indexOf(member);}
function status(text){$('status').textContent=text;}
function changed(){dirty=true;}
function saveLabel(){return state.branch==='main'?'保存して公開':'GitHubに保存（テスト用）';}
function prunePhotos(){const used=new Set(Object.values(data).flat().map(x=>x.photo));for(const key of photoPreviews.keys())if(!used.has(key))photoPreviews.delete(key);for(const key of uploads.keys())if(!used.has('/'+key))uploads.delete(key);}
function graduateStudent(){
 if(group!=='students'||!current())return;
 if(readingPhoto){status('写真の読み込みが終わるまでお待ちください。');return;}
 const index=selected,student=current();
 ask('卒業生へ移動しますか？','「'+student.name+'」の写真・氏名・紹介文を引き継ぎ、学年・役職を「卒業生」に変更します。保存するまでは公開サイトに反映されません。',()=>{
  const [member]=data.students.splice(index,1);
  member.role='卒業生';member.role_en='Alumni';
  data.alumni.unshift(member);group='alumni';selected=0;changed();render();
  status('写真とプロフィールを引き継いで卒業生へ移動しました（未保存）。「保存して公開」で反映します。');
 },'卒業生へ移動');
}
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
function field(name,label,type='text'){const item=current(),v=item[name]||'';return `<label for="field-${name}">${label}</label>`+(type==='textarea'?`<textarea id="field-${name}" data-field="${name}">${esc(v)}</textarea>`:`<input id="field-${name}" data-field="${name}" type="${type}" value="${esc(v)}">`);}
function renderList(){const items=data[group];$('items').innerHTML=items.length?items.map((x,i)=>`<button class="item" data-index="${i}" aria-pressed="${i===selected}"><span>${esc(x.name||x.title||'新しい項目')}</span><small>${esc(x.role||x.date||'')}</small></button>`).join(''):'<div class="empty">まだ登録がありません</div>';$('editor-title').textContent=labels[group]+' ('+items.length+')';}
function renderForm(){const item=current();if(!item){$('form').innerHTML='<p class="help">登録がありません。「＋追加」で追加できます。</p><button class="button" id="save">'+saveLabel()+'</button>';return;}const news=group==='news';$('form').innerHTML=`<div class="group-title">${news?'記事を編集':'プロフィールを編集'}</div>`+(news?field('title','タイトル（日本語）')+field('title_en','タイトル（英語・任意）')+field('date','掲載日','date')+`<label>カテゴリ</label><div>${Object.entries(cats).map(([k,v])=>`<label class="check"><input type="checkbox" data-category="${k}" ${(item.categories||[]).includes(k)?'checked':''}>${v[0]}</label>`).join('')}</div>`+field('body','本文（日本語）','textarea')+field('body_en','本文（英語・任意）','textarea'):field('name','氏名（日本語）')+field('name_en','氏名（英語・任意）')+field('role','学年・役職（日本語）')+field('role_en','学年・役職（英語・任意）'))+`<label for="photo">${news?'記事の写真（任意）':'プロフィール写真'}</label><input type="file" id="photo" accept="image/jpeg,image/png,image/webp,image/gif"><div class="help">JPEG・PNG・WebP・GIF、3MBまで。保存時にGitHubへアップロードします。</div><div class="photo-actions"><button class="button secondary" id="remove-photo">写真を外す</button>${!news?`<select id="photo-position" aria-label="写真の表示位置"><option value="center" ${item.photo_position!=='top'?'selected':''}>写真：中央</option><option value="top" ${item.photo_position==='top'?'selected':''}>写真：上寄せ</option></select>`:''}</div>`+(news?field('url','外部リンク（任意）','url')+field('link_label','リンクの表示文（日本語・任意）')+field('link_label_en','リンクの表示文（英語・任意）'):field('bio','紹介文（日本語・任意）','textarea')+field('bio_en','紹介文（英語・任意）','textarea'))+`<div class="actions"><button class="button" id="save">${saveLabel()}</button>${group==='students'?'<button class="button secondary" id="graduate">卒業生へ移動</button>':''}<button class="button danger" id="delete">この${news?'記事':'メンバー'}を削除</button></div>`;}
function renderPreview(){const news=group==='news';$('preview-title').textContent=news?'News':'Members';$('subtitle').textContent=language==='en'?enLabels[group]:labels[group];$('cards').className='cards'+(news?' news-cards':'');let items=[...data[group]];if(news)items.sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('cards').innerHTML=items.length?items.map(item=>{const src=imageUrl(item.photo);if(news){const url=/^https?:\/\//i.test(item.url||'')?item.url:'';return `<article class="card news">${src?`<img src="${esc(src)}" alt="${esc(item.title)}">`:''}<div class="news-inner"><time>${esc(item.date).replaceAll('-','.')}</time><div>${(item.categories||[]).filter(k=>cats[k]).map(k=>`<span class="tag">${cats[k][language==='en'?1:0]}</span>`).join('')}</div><h4>${esc(value(item,'title','title_en'))}</h4><p>${esc(value(item,'body','body_en'))}</p>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(language==='en'?(item.link_label_en||'Learn More'):(item.link_label||'詳細を見る'))} ↗</a>`:''}</div></article>`;}return `<article class="card">${src?`<img class="portrait" src="${esc(src)}" alt="${esc(item.name)}" style="object-position:${item.photo_position==='top'?'top':'center'}">`:`<div class="portrait placeholder">${esc(Array.from(item.name||'?')[0])}</div>`}<h4>${esc(value(item,'name','name_en'))}</h4><p class="role">${esc(value(item,'role','role_en'))}</p><p class="bio">${esc(value(item,'bio','bio_en'))}</p></article>`;}).join(''):'<div class="empty">'+(language==='en'?'No items yet.':'登録内容がここに表示されます。')+'</div>';}
function render(){renderList();renderForm();renderPreview();document.querySelectorAll('nav [data-group]').forEach(x=>x.classList.toggle('active',x.dataset.group===group));}
document.querySelector('nav').addEventListener('click',e=>{const b=e.target.closest('[data-group]');if(b){group=b.dataset.group;selected=0;status('');render();}});
$('items').addEventListener('click',e=>{const b=e.target.closest('[data-index]');if(b){selected=Number(b.dataset.index);status('');renderList();renderForm();}});
$('form').addEventListener('input',e=>{changed();if(e.target.dataset.field){const edited=current();edited[e.target.dataset.field]=e.target.value;if(group==='students'&&e.target.dataset.field==='role')sortStudents(edited);renderList();renderPreview();status('プレビューに反映しました（未保存）');}if(e.target.dataset.category){current().categories=[...$('form').querySelectorAll('[data-category]:checked')].map(x=>x.dataset.category);renderPreview();status('プレビューに反映しました（未保存）');}});
$('form').addEventListener('change',e=>{
 if(e.target.id==='photo-position'){changed();current().photo_position=e.target.value;renderPreview();status('写真の表示位置を変更しました（未保存）');}
 if(e.target.id==='photo'){
  const file=e.target.files[0];if(!file)return;
  if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>3*1024*1024){status('JPEG・PNG・WebP・GIF形式、3MB以下の写真を選んでください。');return;}
  const target=current(),request={},reader=new FileReader();photoReads.set(target,request);readingPhoto++;
  reader.onerror=reader.onabort=()=>{readingPhoto--;if(photoReads.get(target)===request)status('写真を読み込めませんでした。');};
  reader.onload=()=>{
   readingPhoto--;
   if(photoReads.get(target)!==request||!Object.values(data).some(items=>items.includes(target)))return;
   const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[file.type];
   const path='images/cms/'+crypto.randomUUID()+'.'+ext;target.photo='/'+path;
   photoPreviews.set(target.photo,reader.result);uploads.set(path,{path,base64:reader.result.split(',')[1]});prunePhotos();changed();renderPreview();status('写真を登録しました（未保存）');
  };
  reader.readAsDataURL(file);
 }
});
$('form').addEventListener('click',e=>{if(e.target.id==='graduate'){graduateStudent();}if(e.target.id==='save'){save();}if(e.target.id==='delete'){ask('この項目を削除しますか？','「'+(current().name||current().title||'項目')+'」を一覧から削除します。保存するまではGitHubに反映されません。',()=>{changed();data[group].splice(selected,1);selected=Math.max(0,selected-1);prunePhotos();render();status('一覧から削除しました（未保存）');},'削除する');}if(e.target.id==='remove-photo'){changed();photoReads.delete(current());current().photo='';prunePhotos();renderPreview();status('写真を外しました（未保存）');}});
$('add').addEventListener('click',()=>{changed();const today=new Date(),date=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');data[group].unshift(group==='news'?{title:'新しいニュース',title_en:'',date,categories:['news'],body:'ここにニュースの本文を入力してください。',body_en:'',photo:'',photo_alt:'',url:'',link_label:'',link_label_en:''}:{name:'新しいメンバー',name_en:'',role:group==='alumni'?'卒業生':'',role_en:'',photo:'',photo_position:'center',bio:'',bio_en:''});selected=0;if(group==='students')sortStudents(current());render();status('追加しました。内容を入力してください（未保存）');});
$('language').addEventListener('change',e=>{language=e.target.value;renderPreview();});
function ask(title,text,action,confirmLabel='実行する'){$('confirm-title').textContent=title;$('confirm-text').textContent=text;$('do-confirm').textContent=confirmLabel;$('do-confirm').classList.toggle('danger',confirmLabel==='削除する');pendingAction=action;$('confirm').showModal();}
$('cancel-confirm').onclick=()=>{$('confirm').close();pendingAction=null;};$('do-confirm').onclick=()=>{$('confirm').close();if(pendingAction)pendingAction();pendingAction=null;};
$('reset').onclick=()=>ask('GitHubから再読み込みしますか？','未保存の変更は破棄されます。GitHubの最新内容を読み直します。',()=>{dirty=false;location.reload();},'再読み込みする');
$('logout').onclick=()=>ask('ログアウトしますか？','未保存の内容は破棄されます。',async()=>{try{const response=await fetch('/auth/logout',{method:'POST',headers:{'X-CSRF-Token':state.csrf}});if(!response.ok)throw new Error('ログアウトできませんでした。');dirty=false;location.assign('/login');}catch(error){status(error.message);}},'ログアウトする');
async function save(){
 if(saving)return;if(readingPhoto){status('写真の読み込みが終わるまでお待ちください。');return;}saving=true;
 const controls=[...document.querySelectorAll('button,input,select,textarea')];controls.forEach(x=>x.disabled=true);
 status('GitHubに保存しています…');
 try{
   const used=new Set(Object.values(data).flat().map(x=>x.photo));
   const pending=[...uploads.values()].filter(x=>used.has('/'+x.path));
   const response=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.csrf,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({head:state.head,data,uploads:pending})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'保存できませんでした。');
   state.head=result.head;dirty=false;uploads.clear();
   status(state.branch==='main'?'GitHubに保存しました。公開サイトへの反映には少し時間がかかります。':'テスト用ブランチに保存しました。公開サイトは変更されません。');
 }catch(error){status(error.message+' 内容はこの画面に残っています。');}
 finally{saving=false;controls.forEach(x=>x.disabled=false);}
}
$('connection-notice').textContent='ログイン中：'+state.login+' ／ '+state.repository+' ／ 保存先：'+state.branch+(state.branch==='main'?'（保存すると公開対象になります）':'（テスト用・公開サイトには反映されません）');
sortStudents();
render();
