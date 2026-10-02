import{createClient}from'https://esm.sh/@supabase/supabase-js@2';
const U='https://jbdjfmvdrwdfnuhqrprc.supabase.co',K='sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80';
const sb=createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}),$=id=>document.getElementById(id);
async function boot(){
 const {data:{user}}=await sb.auth.getUser();if(!user)return;
 const {data:p}=await sb.from('profiles').select('role').eq('id',user.id).maybeSingle();
 const role=String(p?.role||'').toLowerCase();
 if(role!=='master'&&role!=='dono')return;
 const tabs=document.querySelector('.tabs');if(!tabs||$('gpCineplayPushTab'))return;
 const tab=document.createElement('button');tab.id='gpCineplayPushTab';tab.type='button';tab.textContent='🔔 Push Cineplay';tabs.appendChild(tab);
 const section=document.createElement('section');section.id='gpCineplayPushView';section.className='view';
 section.innerHTML='<div class="panel gp-cp-push-panel"><div class="gp-cp-push-head"><div><h3>🔔 Enviar notificação para o Cineplay</h3><div class="muted">Mensagem enviada somente para os visitantes que autorizaram notificações no site Cineplay.</div></div><span class="gp-cp-push-badge">MASTER / DONO</span></div><div class="grid" style="margin-top:16px"><div class="field"><label>Título</label><input id="gpCpPushTitle" maxlength="80" value="Cineplay TV"></div><div class="field"><label>Link ao clicar</label><input id="gpCpPushUrl" maxlength="500" value="https://www.cineplayftv.shop/"></div></div><div class="field" style="margin-top:10px"><label>Mensagem</label><textarea id="gpCpPushBody" maxlength="240" placeholder="Digite a mensagem que será enviada..."></textarea><div class="muted" style="font-size:11px;margin-top:4px">Até 240 caracteres.</div></div><div class="row"><button id="gpCpPushSend">📢 ENVIAR NOTIFICAÇÃO</button><button id="gpCpPushClear" class="secondary">Limpar</button></div><div id="gpCpPushMsg" class="muted" style="margin-top:12px"></div></div>';
 document.querySelector('.wrap').appendChild(section);
 const st=document.createElement('style');st.id='gpCpPushStyle';st.textContent='#gpCineplayPushView .gp-cp-push-panel{background:linear-gradient(145deg,#17131f,#111016)!important}#gpCineplayPushView .gp-cp-push-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}#gpCineplayPushView .gp-cp-push-badge{font-size:10px;font-weight:800;padding:6px 9px;border-radius:999px;background:#4c1d95;color:#ede9fe;white-space:nowrap}#gpCineplayPushView textarea{min-height:110px!important;resize:vertical}#gpCineplayPushView #gpCpPushSend{background:#7c3aed}@media(max-width:600px){#gpCineplayPushView .gp-cp-push-head{flex-direction:column}}';document.head.appendChild(st);
 const msg=(t,ok=false)=>{const e=$('gpCpPushMsg');e.textContent=t;e.className=ok?'ok':'muted'};
 tab.onclick=()=>{document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));section.classList.add('active')};
 $('gpCpPushClear').onclick=()=>{$('gpCpPushTitle').value='Cineplay TV';$('gpCpPushUrl').value='https://www.cineplayftv.shop/';$('gpCpPushBody').value='';msg('')};
 $('gpCpPushSend').onclick=async()=>{
  const b=$('gpCpPushBody').value.trim(),title=$('gpCpPushTitle').value.trim()||'Cineplay TV',url=$('gpCpPushUrl').value.trim()||'https://www.cineplayftv.shop/';
  if(!b)return msg('Digite a mensagem antes de enviar.');
  if(!confirm('Enviar esta notificação para todos os inscritos do Cineplay?'))return;
  const btn=$('gpCpPushSend');btn.disabled=true;btn.textContent='ENVIANDO...';msg('');
  try{
   const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Sessão expirada. Faça login novamente.');
   const r=await fetch(U+'/functions/v1/cineplay-push',{method:'POST',headers:{apikey:K,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'send-manual',title,body:b,url})});
   const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data?.error||('HTTP '+r.status));
   msg('Notificação enviada: '+Number(data.sent||0)+' de '+Number(data.total||0)+' inscritos.',true);
  }catch(e){console.error('[GestorPro Push Cineplay]',e);msg(e?.message||String(e))}finally{btn.disabled=false;btn.textContent='📢 ENVIAR NOTIFICAÇÃO'}
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot().catch(console.error));else boot().catch(console.error);