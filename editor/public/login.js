let running=false;
const button=document.getElementById('start-login'),status=document.getElementById('login-status');
async function post(path){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const result=await response.json();if(!response.ok)throw new Error(result.error||'通信に失敗しました。');return result;}
button.addEventListener('click',async()=>{
  if(running)return;running=true;button.disabled=true;status.textContent='GitHubへの接続を準備しています…';
  try{
    const result=await post('/auth/start');document.getElementById('user-code').textContent=result.userCode;document.getElementById('device-step').hidden=false;
    status.textContent='GitHubでの承認を待っています。';let interval=result.interval;
    for(let count=0;count<180;count++){
      await new Promise(resolve=>setTimeout(resolve,Math.max(interval,5)*1000));
      const state=await post('/auth/poll');if(state.status==='success'){location.assign('/');return;}interval=state.interval||5;
    }
    throw new Error('時間が経過しました。ログインをやり直してください。');
  }catch(error){status.textContent=error.message;button.disabled=false;running=false;document.getElementById('device-step').hidden=true;}
});
