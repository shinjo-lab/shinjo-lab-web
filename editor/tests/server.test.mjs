import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHandler} from '../server.mjs';
async function serve(handler,run){const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await run('http://127.0.0.1:'+server.address().port);}finally{await new Promise(resolve=>server.close(resolve));}}
test('anonymous visitors cannot access editor JS, content, saves, or traversal paths',async()=>{
 await serve(createHandler({origin:'http://127.0.0.1:8770'}),async base=>{
  for(const path of ['/api/state','/app.js'])assert.equal((await fetch(base+path)).status,401);
  assert.equal((await fetch(base+'/api/save',{method:'POST'})).status,401);
  assert.equal((await fetch(base+'/repository.mjs')).status,404);
  const page=await fetch(base+'/',{redirect:'manual'});assert.equal(page.status,303);assert.equal(page.headers.get('location'),'/login');
 });
});
test('login requires same origin, keeps tokens server-side, rotates session and denies forged saves',async()=>{
 let time=100000,oauthCalls=0;
 const handler=createHandler({clientId:'public-client-id',origin:'http://127.0.0.1:8770',now:()=>time,fetcher:async(url,opts)=>{
  let result;
  if(url.endsWith('/login/device/code'))result={device_code:'SECRET_DEVICE',user_code:'CODE-TEST',expires_in:900,interval:5};
  else if(url.endsWith('/login/oauth/access_token')){oauthCalls++;result={access_token:'SECRET_TOKEN',expires_in:28800};}
  else if(url.endsWith('/user'))result={login:'editor'};
  else result={permissions:{push:true}};
  return {ok:true,json:async()=>result};
 }});
 await serve(handler,async base=>{
  assert.equal((await fetch(base+'/auth/start',{method:'POST',headers:{Origin:'https://evil.test'}})).status,403);
  const start=await fetch(base+'/auth/start',{method:'POST',headers:{Origin:'http://127.0.0.1:8770'}});const payload=await start.text();
  assert.ok(payload.includes('CODE-TEST'));assert.ok(!payload.includes('SECRET_DEVICE'));
  const oldCookie=start.headers.get('set-cookie').split(';')[0];
  const early=await fetch(base+'/auth/poll',{method:'POST',headers:{Origin:'http://127.0.0.1:8770',Cookie:oldCookie}});assert.equal((await early.json()).status,'pending');assert.equal(oauthCalls,0);
  time+=6000;const poll=await fetch(base+'/auth/poll',{method:'POST',headers:{Origin:'http://127.0.0.1:8770',Cookie:oldCookie}});const text=await poll.text();assert.ok(!text.includes('SECRET_TOKEN'));assert.ok(text.includes('success'));
  const cookie=poll.headers.get('set-cookie');assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Lax'));assert.notEqual(cookie.split(';')[0],oldCookie);
  assert.equal((await fetch(base+'/api/save',{method:'POST',headers:{Cookie:cookie.split(';')[0],Origin:'http://127.0.0.1:8770'}})).status,403);
  assert.equal((await fetch(base+'/api/state',{headers:{Cookie:oldCookie}})).status,401);
 });
});
