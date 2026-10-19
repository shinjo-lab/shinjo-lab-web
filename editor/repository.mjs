import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const renderer = require('../assets/content.js');
export const repository = 'shinjo-lab/shinjo-lab-web';
export const groups = ['students','staff','alumni','news'];
export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail = message => {throw new HttpError(400,message);};
const fields = {
  member:['name','name_en','role','role_en','photo','photo_position','bio','bio_en'],
  news:['title','title_en','date','categories','body','body_en','photo','photo_alt','url','link_label','link_label_en']
};
export function validateContent(data) {
  if (!data || typeof data!=='object' || groups.some(k=>!Array.isArray(data[k]))) fail('編集データの形式が正しくありません。');
  const clean={};
  for (const group of groups) {
    if(data[group].length>500)fail('登録数は各一覧500件までです。');
    clean[group]=data[group].map(item=>{
      if(!item || typeof item!=='object' || Array.isArray(item))fail('項目の形式が正しくありません。');
      const result={};
      for(const key of fields[group==='news'?'news':'member']) {
        if(key==='categories'){
          if(!Array.isArray(item[key]) || item[key].some(v=>!['news','media','publication','project'].includes(v)))fail('ニュースのカテゴリを確認してください。');
          result[key]=[...new Set(item[key])];continue;
        }
        if(item[key]!=null && typeof item[key]!=='string')fail('文字列以外の入力があります。');
        const value=(item[key]||'').trim();
        if(value.length>(['body','body_en','bio','bio_en'].includes(key)?20000:1000))fail('入力が長すぎます。');
        result[key]=value;
      }
      const name=result[group==='news'?'title':'name'];
      if(!name)fail(group==='news'?'ニュースのタイトルを入力してください。':'氏名を入力してください。');
      if(result.photo && (!/^\/images\/[a-zA-Z0-9_./% -]+$/.test(result.photo) || result.photo.includes('..')))fail('写真のパスが正しくありません。');
      if(group==='news'){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(result.date) || Number.isNaN(Date.parse(result.date)) || new Date(result.date).toISOString().slice(0,10)!==result.date)fail('掲載日を確認してください。');
        if(!result.categories.length)fail('カテゴリを選択してください。');
        if(!result.body)fail('ニュース本文を入力してください。');
        if(result.url){try{const url=new URL(result.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)fail('リンクはhttpまたはhttpsで入力してください。');}catch{fail('リンクURLが正しくありません。');}}
      }else if(!['center','top',''].includes(result.photo_position))fail('写真の位置が正しくありません。');
      return result;
    });
  }
  return clean;
}
export function validateUploads(uploads,data){
  if(!Array.isArray(uploads)||uploads.length>12)fail('写真は1回の保存につき12枚までです。');
  let total=0;const seen=new Set();
  return uploads.map(file=>{
    if(!file||typeof file.path!=='string'||!/^images\/cms\/[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(file.path)||seen.has(file.path))fail('写真のファイル名が正しくありません。');
    seen.add(file.path);
    if(!groups.some(g=>data[g].some(x=>x.photo==='/'+file.path)))fail('登録内容に使われていない写真があります。');
    if(typeof file.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)||file.base64.length>4200000)fail('写真の形式またはサイズを確認してください。');
    const bytes=Buffer.from(file.base64,'base64');total+=bytes.length;
    if(!bytes.length||bytes.length>3*1024*1024||total>12*1024*1024)fail('写真は1枚3MB、合計12MBまでです。');
    const ext=file.path.split('.').pop();
    const valid=ext==='jpg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:ext==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):ext==='gif'?['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()):bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
    if(!valid)fail('対応している写真形式ではありません。');
    return {path:file.path,base64:file.base64};
  });
}
export function replaceContainer(html,id,content){
  const startTag=new RegExp(`<div\\b[^>]*\\bid="${id}"[^>]*>`).exec(html);
  if(!startTag)throw new HttpError(409,'サイトの構造が変わっています。管理者に確認してください。');
  const start=startTag.index+startTag[0].length;
  const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=start;let depth=1,match;
  while((match=tags.exec(html))){depth+=match[0].startsWith('</')?-1:1;if(depth===0)return html.slice(0,start)+'\n'+content+'\n'+html.slice(match.index);}
  throw new HttpError(409,'サイトの構造を読み取れません。');
}
export function snapshot(html,data){
  for(const group of groups){const items=[...data[group]];if(group==='news')items.sort((a,b)=>b.date.localeCompare(a.date));html=replaceContainer(html,'cms-'+group,items.map(x=>group==='news'?renderer.article(x):renderer.member(x,group)).join('\n'));}
  return html;
}
export function createRepositoryClient(token,branch,fetcher=fetch){
  async function api(path,method='GET',body){
    const r=await fetcher('https://api.github.com'+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'User-Agent':'Shinjo-Lab-Editor','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    const result=await r.json();
    if(!r.ok)throw new HttpError(r.status===401?401:r.status===403?403:r.status===409||r.status===422?409:502,r.status===401?'ログイン期限が切れました。':r.status===403?'GitHubの書き込み権限がありません。':r.status===409||r.status===422?'他の更新があります。再読み込みしてください。':'GitHubとの通信に失敗しました。');
    return result;
  }
  const base='/repos/'+repository;
  async function authorize(){const repo=await api(base);if(!repo.permissions?.push)throw new HttpError(403,'このリポジトリの編集権限がありません。');return repo;}
  async function head(){return api(base+'/git/ref/heads/'+branch.split('/').map(encodeURIComponent).join('/'));}
  async function text(path,ref){const f=await api(base+'/contents/'+path+'?ref='+encodeURIComponent(ref));if(f.encoding!=='base64'||typeof f.content!=='string')throw new HttpError(502,'GitHubのファイルを取得できません。');return Buffer.from(f.content,'base64').toString('utf8');}
  async function read(){await authorize();const ref=(await head()).object.sha;const content={};await Promise.all(groups.map(async g=>{content[g]=JSON.parse(await text('content/'+g+'.json',ref)).items;}));return {head:ref,data:validateContent(content),branch,repository};}
  async function save(payload){
    await authorize();const data=validateContent(payload.data),uploads=validateUploads(payload.uploads||[],data);
    if(!/^[a-f0-9]{40}$/.test(payload.head||''))fail('再読み込みしてから保存してください。');
    const before=(await head()).object.sha;if(before!==payload.head)throw new HttpError(409,'他の人の更新があります。上書きせず、再読み込みしてください。');
    const commit=await api(base+'/git/commits/'+before);
    const html=snapshot(await text('index.html',before),data);
    const entries=groups.map(g=>({path:'content/'+g+'.json',mode:'100644',type:'blob',content:JSON.stringify({items:data[g]},null,2)+'\n'}));
    entries.push({path:'index.html',mode:'100644',type:'blob',content:html});
    for(const file of uploads){const blob=await api(base+'/git/blobs','POST',{content:file.base64,encoding:'base64'});entries.push({path:file.path,mode:'100644',type:'blob',sha:blob.sha});}
    const tree=await api(base+'/git/trees','POST',{base_tree:commit.tree.sha,tree:entries});
    const next=await api(base+'/git/commits','POST',{message:'Update lab members and news from visual editor',tree:tree.sha,parents:[before]});
    await api(base+'/git/refs/heads/'+branch.split('/').map(encodeURIComponent).join('/'),'PATCH',{sha:next.sha,force:false});
    return {head:next.sha,branch,url:`https://github.com/${repository}/commit/${next.sha}`};
  }
  return {api,read,save,authorize};
}
