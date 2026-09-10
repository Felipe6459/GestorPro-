// GestorPro — render definitivo de Próximos vencimentos
import{createClient}from'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://jbdjfmvdrwdfnuhqrprc.supabase.co','sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const hide=()=>{const b=document.getElementById('dashRows');if(b)b.style.visibility='hidden'};
const show=()=>{const b=document.getElementById('dashRows');if(b)b.style.visibility='visible'};
hide();
const D=v=>{let p=String(v||'').slice(0,10).split('-');return p.length===3?new Date(+p[0],+p[1]-1,+p[2]):null};
const F=v=>{let d=D(v);return d?d.toLocaleDateString('pt-BR'):'—'};
const N=v=>'R$ '+Number(v||0).toFixed(2).replace('.',',');
async function run(){
 const b=document.getElementById('dashRows');if(!b)return;
 const q=await sb.auth.getSession(),s=q.data&&q.data.session;if(!s)return;
 const p=await sb.from('profiles').select('organization_id').eq('id',s.user.id).maybeSingle();if(p.error||!p.data)return;
 const o=p.data.organization_id;
 const [r,v]=await Promise.all([sb.from('clients').select('id,name,whatsapp,value,due_date,server_id').eq('organization_id',o),sb.from('servers').select('id,name').eq('organization_id',o)]);
 if(r.error){return}
 const today=new Date();today.setHours(0,0,0,0);const limit=new Date(today);limit.setDate(limit.getDate()+7);
 const rows=(r.data||[]).map(c=>{const d=D(c.due_date);return{c,n:d?Math.round((d-today)/86400000):99999}}).filter(x=>x.n>=0&&x.n<=7).sort((a,z)=>a.n-z.n).slice(0,7);
 const ss=v.data||[];
 b.innerHTML=rows.length?rows.map(x=>{const c=x.c,sv=ss.find(z=>z.id===c.server_id),ph=String(c.whatsapp||'').replace(/\D/g,'');const w=ph?'<button class="wa" data-wa="https://wa.me/'+(ph.indexOf('55')===0?ph:'55'+ph)+'">WhatsApp</button>':'<span class="muted">Sem número</span>';return'<tr><td>'+String(c.name||'')+'</td><td>'+String(sv?sv.name:'—')+'</td><td>'+F(c.due_date)+'</td><td>'+N(c.value)+'</td><td>'+w+'</td></tr>'}).join(''):'<tr><td colspan="5" class="muted">Nenhum cliente vencendo nos próximos 7 dias.</td></tr>';
 show();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{run();setTimeout(run,700);setTimeout(run,1600)});else{run();setTimeout(run,700);setTimeout(run,1600)}
