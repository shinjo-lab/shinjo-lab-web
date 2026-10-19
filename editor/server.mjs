import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRepositoryClient,HttpError} from './repository.mjs';

const root=dirname(fileURLToPath(import.meta.url));
export function createHandler(options={}){
  const clientId=options.clientId??process.env.GITHUB_CLIENT_ID;
  const origin=new URL(options.origin??process.env.APP_ORIGIN??process.env.RENDER_EXTERNAL_URL??'http://127.0.0.1:8770').origin;
  const branch=options.branch??process.env.EDIT_BRANCH??'codex/member-news-cms';
  const fetcher=options.fetcher??fetch;
  const now=options.now??Date.now;
  const secure=origin.startsWith('https:');
  if(!secure&&!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw new Error('APP_ORIGIN must use HTTPS');
  const cookieName=secure?'__Host-lab_editor':'lab_editor';
  const sessions=new Map(),limits=new Map();
  const nonce=()=>randomBytes(32).toString('base64url');
  function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
  function setSession(res,id){res.setHeader('Set-Cookie',`${cookieName}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=25200${secure?'; Secure':''}`);}
  function getSession(req){const pair=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));const id=pair?.slice(cookieName.length+1);const s=sessions.get(id);if(s&&s.expires>now())return {id,...s};if(id)sessions.delete(id);return null;}
  function authorizeRequest(req){if(req.headers.origin!==origin)throw new HttpError(403,'許可されていない送信元です。');}
  function auth(req){const session=getSession(req);if(!session?.token)throw new HttpError(401,'GitHubでログインしてください。');return session;}
  function csrf(req,s){authorizeRequest(req);if(!s.csrf||req.headers['x-csrf-token']!==s.csrf)throw new HttpError(403,'画面を再読み込みしてください。');}
  async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>18*1024*1024)throw new HttpError(413,'送信サイズが大きすぎます。');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new HttpError(400,'送信データを読み取れません。');}}
  async function githubOAuth(path,args){const r=await fetcher('https://github.com'+path,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','User-Agent':'Shinjo-Lab-Editor'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new HttpError(502,'GitHubログインとの通信に失敗しました。');return r.json();}
  async function staticFile(res,path,type){res.writeHead(200,{'Content-Type':type});res.end(await readFile(join(root,'public',path)));}
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://shinjo-lab.com data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const url=new URL(req.url,origin);
    try{
      for(const [id,s]of sessions)if(s.expires<=now())sessions.delete(id);
      for(const [ip,limit]of limits)if(limit.reset<now())limits.delete(ip);
      if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,configured:!!clientId});
      if(req.method==='GET'&&['/style.css','/login.js'].includes(url.pathname))return staticFile(res,url.pathname.slice(1),url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
      if(req.method==='GET'&&url.pathname==='/login')return staticFile(res,'login.html','text/html; charset=utf-8');
      if(req.method==='POST'&&url.pathname==='/auth/start'){
        authorizeRequest(req);
        if(!clientId)throw new HttpError(503,'GitHub Appの接続設定がまだ完了していません。');
        const ip=req.socket.remoteAddress||'unknown',limit=limits.get(ip)||{count:0,reset:now()+3600000};
        if(++limit.count>20)throw new HttpError(429,'しばらく待ってからログインしてください。');limits.set(ip,limit);
        if(sessions.size>=1000)throw new HttpError(503,'現在混み合っています。しばらく待ってください。');
        const result=await githubOAuth('/login/device/code',{client_id:clientId});
        if(!result.device_code||!result.user_code||result.error)throw new HttpError(503,'GitHub AppのDevice flow設定を確認してください。');
        const id=nonce();sessions.set(id,{device:result.device_code,expires:now()+Math.min(result.expires_in||900,900)*1000,interval:Math.max(result.interval||5,5),nextPoll:now()+Math.max(result.interval||5,5)*1000});setSession(res,id);
        return json(res,200,{userCode:result.user_code,verificationUrl:'https://github.com/login/device',interval:Math.max(result.interval||5,5)});
      }
      if(req.method==='POST'&&url.pathname==='/auth/poll'){
        authorizeRequest(req);const s=getSession(req);if(!s?.device)throw new HttpError(401,'ログインをやり直してください。');
        const stored=sessions.get(s.id);
        if(now()<stored.nextPoll)return json(res,200,{status:'pending',interval:Math.ceil((stored.nextPoll-now())/1000)});
        stored.nextPoll=now()+stored.interval*1000;
        const result=await githubOAuth('/login/oauth/access_token',{client_id:clientId,device_code:s.device,grant_type:'urn:ietf:params:oauth:grant-type:device_code',repository_id:'1187076190'});
        if(result.error==='authorization_pending')return json(res,200,{status:'pending',interval:stored.interval});
        if(result.error==='slow_down'){stored.interval+=5;stored.nextPoll=now()+stored.interval*1000;return json(res,200,{status:'pending',interval:stored.interval});}
        if(result.error||!result.access_token){sessions.delete(s.id);throw new HttpError(401,'GitHubでの承認が完了しませんでした。ログインをやり直してください。');}
        const client=createRepositoryClient(result.access_token,branch,fetcher);
        const user=await client.api('/user');await client.authorize();
        sessions.delete(s.id);const id=nonce();sessions.set(id,{token:result.access_token,login:user.login,csrf:nonce(),expires:now()+Math.min(result.expires_in||25200,25200)*1000,requests:new Map()});setSession(res,id);
        return json(res,200,{status:'success'});
      }
      if(req.method==='GET'&&url.pathname==='/'){
        if(!getSession(req)?.token){res.writeHead(303,{Location:'/login'});return res.end();}
        return staticFile(res,'index.html','text/html; charset=utf-8');
      }
      if(req.method==='GET'&&url.pathname==='/app.js'){auth(req);return staticFile(res,'app.js','text/javascript; charset=utf-8');}
      if(req.method==='GET'&&url.pathname==='/api/state'){
        const s=auth(req);const result=await createRepositoryClient(s.token,branch,fetcher).read();return json(res,200,{...result,login:s.login,csrf:s.csrf});
      }
      if(req.method==='POST'&&url.pathname==='/auth/logout'){
        const s=auth(req);csrf(req,s);sessions.delete(s.id);res.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`);return json(res,200,{ok:true});
      }
      if(req.method==='POST'&&url.pathname==='/api/save'){
        const s=auth(req);csrf(req,s);
        const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[a-f0-9-]{36}$/.test(key))throw new HttpError(400,'保存リクエストが正しくありません。');
        const stored=sessions.get(s.id);
        if(stored.requests.has(key))return json(res,200,await stored.requests.get(key));
        if(stored.saving)throw new HttpError(409,'保存中です。完了までお待ちください。');
        stored.saving=true;
        const saving=(async()=>createRepositoryClient(s.token,branch,fetcher).save(await body(req)))();stored.requests.set(key,saving);
        try{const result=await saving;return json(res,200,result);}finally{stored.saving=false;if(stored.requests.size>20)stored.requests.delete(stored.requests.keys().next().value);}
      }
      throw new HttpError(404,'ページがありません。');
    }catch(error){
      // Never log provider tokens, input photos, authorization codes, or raw provider responses.
      const status=error instanceof HttpError?error.status:502;
      if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/'))return json(res,status,{error:error instanceof HttpError?error.message:'通信に失敗しました。保存結果が不明な場合は再読み込みして確認してください。'});
      res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(error instanceof HttpError?error.message:'画面を表示できません。');
    }
  };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const port=Number(process.env.PORT||8770);http.createServer(createHandler()).listen(port,'0.0.0.0',()=>console.log(`Lab editor listening on port ${port}`));
}
