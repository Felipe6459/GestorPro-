import{createClient}from'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://jbdjfmvdrwdfnuhqrprc.supabase.co','sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let org='',clients=[],templates=[];
const DEF=[[-7,'7 dias antes','Olá {nome}! Sua assinatura vence em 7 dias ({vencimento}). Valor: {valor}.'],[-5,'5 dias antes','Olá {nome}! Sua assinatura vence em 5 dias ({vencimento}). Valor: {valor}.'],[-3,'3 dias antes','Olá {nome}! Faltam 3 dias para sua assinatura vencer ({vencimento}). Valor: {valor}.'],[-2,'2 dias antes','Olá {nome}! Faltam 2 dias para sua assinatura vencer ({vencimento}). Valor: {valor}.'],[-1,'1 dia antes','Olá {nome}! Amanhã ({vencimento}) vence sua assinatura. Valor: {valor}.'],[0,'Dia do vencimento','Olá {nome}! Hoje ({vencimento}) é o vencimento da sua assinatura. Valor: {valor}.'],[1,'1 dia atrasado','Olá {nome}! Sua assinatura venceu ontem ({vencimento}). Valor: {valor}.'],[3,'3 dias atrasado','Olá {nome}! Sua assinatura está vencida há 3 dias ({vencimento}). Valor: {valor}.'],[5,'5+ dias atrasado','Olá {nome}! Sua assinatura está vencida há 5 dias ou mais ({vencimento}). Valor: {valor}.']];
const money=v=>'R$ '+Number(v||0).toFixed(2).replace('.',',');
const fmt=v=>{if(!v)return'—';const p=String(v).slice(0,10).split('-');return p[2]+'/'+p[1]+'/'+p[0]};
const days=v=>{if(!v)return null;const a=new Date();a.setHours(0,0,0,0);return Math.round((new Date(String(v).slice(0,10)+'T00:00:00')-a)/86400000)};
function template(c){const d=days(c.due_date);if(d===null)return null;const o=d>=7?-7:d>=5?-5:d>=3?-3:d===2?-2:d===1?-1:d===0?0:d===-1?1:d>=-3?3:5;return templates.find(t=>Number(t.day_offset)===o)||templates.find(t=>Number(t.day_offset)===0)}
function build(c){let n=String(c.whatsapp||'').replace(/\D/g,'');if(!n)return null;if(!n.startsWith('55'))n='55'+n;const t=template(c),m=t?String(t.message).replaceAll('{nome}',c.name||'').replaceAll('{vencimento}',fmt(c.due_date)).replaceAll('{valor}',money(c.value)).replaceAll('{plano}',c.plan||'').replaceAll('{servidor}',c.server_name||''):'';return{href:'https://wa.me/'+n+'?text='+encodeURIComponent(m)}}
function ensure(){
 const rows=document.getElementById('clientRows');if(!rows)return;
 rows.querySelectorAll('tr').forEach(tr=>{
  if(tr.querySelector('.wa'))return;
  const edit=tr.querySelector('[data-edit]');if(!edit)return;
  const c=clients.find(x=>x.id===edit.dataset.edit);if(!c||!c.whatsapp)return;
  const cell=tr.children[7];if(!cell)return;
  const b=document.createElement('button');b.className='wa';b.type='button';b.textContent='WhatsApp';b.dataset.wa=build(c)?.href||'';if(!b.dataset.wa)return;
  cell.replaceChildren(b);
 });
}
async function load(){
 try{
  const{data:{user}}=await sb.auth.getUser();if(!user)return;
  const{data:p}=await sb.from('profiles').select('organization_id').eq('id',user.id).maybeSingle();org=p?.organization_id||'';if(!org)return;
  const a=await sb.from('clients').select('id,name,whatsapp,value,plan,due_date,server_id').eq('organization_id',org);
  clients=a.data||[];
  const s=await sb.from('servers').select('id,name').eq('organization_id',org);const sm=new Map((s.data||[]).map(x=>[x.id,x.name]));
  clients=clients.map(c=>({...c,server_name:sm.get(c.server_id)||'—'}));
  const t=await sb.from('whatsapp_templates').select('day_offset,message,active').eq('organization_id',org).order('day_offset',{ascending:true});
  templates=t.data?.length?t.data:DEF.map(x=>({day_offset:x[0],message:x[2],active:true}));
  ensure();
 }catch(e){console.warn('[GestorPro WhatsApp manual]',e)}
}
function boot(){load();setTimeout(ensure,1500);new MutationObserver(()=>ensure()).observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();