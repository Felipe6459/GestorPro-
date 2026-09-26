import{createClient}from'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://jbdjfmvdrwdfnuhqrprc.supabase.co','sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const money=v=>'R$ '+Number(v||0).toFixed(2).replace('.',',');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let org='',timer=0;
function style(){
 if($('gpDashboardModernStyle'))return;
 const s=document.createElement('style');s.id='gpDashboardModernStyle';s.textContent=`
#gpDashboardModern{margin-top:0}
#gpDashboardModern .gpm-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:22px}
#gpDashboardModern .gpm-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#a78bfa;font-weight:800}
#gpDashboardModern .gpm-title{font-size:25px;font-weight:800;letter-spacing:-.7px;margin:4px 0;color:#fff}
#gpDashboardModern .gpm-sub{font-size:12px;color:#8e8998}
#gpDashboardModern .gpm-date{font-size:12px;color:#aaa4b3;background:#15131b;border:1px solid #292531;border-radius:10px;padding:8px 11px}
#gpDashboardModern .gpm-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
#gpDashboardModern .gpm-kpi{position:relative;min-height:124px;padding:18px;border-radius:18px;background:linear-gradient(145deg,#17151d,#111016);border:1px solid #282431;overflow:hidden}
#gpDashboardModern .gpm-kpi:after{content:'';position:absolute;width:110px;height:110px;border-radius:50%;right:-45px;top:-48px;background:rgba(139,92,246,.10)}
#gpDashboardModern .gpm-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:rgba(139,92,246,.13);color:#c4b5fd;font-size:16px;margin-bottom:12px}
#gpDashboardModern .gpm-label{font-size:11px;color:#8f8998}
#gpDashboardModern .gpm-value{font-size:25px;font-weight:800;letter-spacing:-.7px;margin-top:3px;color:#fff}
#gpDashboardModern .gpm-meta{font-size:10px;color:#716c78;margin-top:7px}
#gpDashboardModern .gpm-green .gpm-icon{background:rgba(52,211,153,.10);color:#6ee7b7}
#gpDashboardModern .gpm-green .gpm-value{color:#6ee7b7}
#gpDashboardModern .gpm-red .gpm-icon{background:rgba(251,113,133,.10);color:#fb7185}
#gpDashboardModern .gpm-red .gpm-value{color:#fb7185}
#gpDashboardModern .gpm-orange .gpm-icon{background:rgba(251,191,36,.10);color:#fbbf24}
#gpDashboardModern .gpm-main{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(290px,.85fr);gap:14px;margin-top:14px}
#gpDashboardModern .gpm-card{background:linear-gradient(145deg,#15131b,#0f0e13);border:1px solid #282431;border-radius:18px;padding:19px;min-width:0}
#gpDashboardModern .gpm-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;margin-bottom:16px}
#gpDashboardModern .gpm-card-title{font-size:14px;font-weight:750;color:#f5f3f8}
#gpDashboardModern .gpm-card-desc{font-size:11px;color:#797381;margin-top:3px}
#gpDashboardModern .gpm-total{font-size:19px;font-weight:800;color:#ddd6fe}
#gpDashboardModern .gpm-chart{height:235px;display:flex;align-items:stretch;gap:8px;padding:12px 0 0;border-bottom:1px solid #24212a}
#gpDashboardModern .gpm-bar-col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;min-width:0;height:100%}
#gpDashboardModern .gpm-bar{width:min(34px,70%);border-radius:7px 7px 2px 2px;background:linear-gradient(180deg,#c4b5fd,#8b5cf6,#5b21b6);box-shadow:0 0 16px rgba(139,92,246,.16);min-height:3px}
#gpDashboardModern .gpm-bar.current{background:linear-gradient(180deg,#ede9fe,#a78bfa,#7c3aed);box-shadow:0 0 20px rgba(139,92,246,.4)}
#gpDashboardModern .gpm-bar-value{font-size:9px;color:#a8a2b0;margin-bottom:5px}
#gpDashboardModern .gpm-month{font-size:9px;color:#706b77;margin-top:7px;text-transform:capitalize}
#gpDashboardModern .gpm-donut-wrap{display:flex;align-items:center;justify-content:center;gap:22px;min-height:235px}
#gpDashboardModern .gpm-donut{width:150px;height:150px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#8b5cf6 0deg 0deg,#27232d 0deg 360deg);flex:none}
#gpDashboardModern .gpm-donut-hole{width:104px;height:104px;border-radius:50%;background:#121117;display:flex;flex-direction:column;align-items:center;justify-content:center}
#gpDashboardModern .gpm-donut-num{font-size:24px;font-weight:800;color:#fff}
#gpDashboardModern .gpm-donut-label{font-size:9px;color:#7d7785}
#gpDashboardModern .gpm-legend{display:flex;flex-direction:column;gap:11px}
#gpDashboardModern .gpm-legend-row{display:flex;align-items:center;gap:8px;font-size:11px;color:#a9a4af}
#gpDashboardModern .gpm-dot{width:8px;height:8px;border-radius:50%;background:#8b5cf6}
#gpDashboardModern .gpm-dot.green{background:#34d399}.gpm-dot.red{background:#fb7185}.gpm-dot.gray{background:#514b59}
#gpDashboardModern .gpm-bottom{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,.8fr);gap:14px;margin-top:14px}
#gpDashboardModern .gpm-list{display:flex;flex-direction:column;gap:5px}
#gpDashboardModern .gpm-row{display:grid;grid-template-columns:1.5fr 1fr .8fr .7fr;align-items:center;gap:10px;padding:11px 10px;border-radius:10px}
#gpDashboardModern .gpm-row.head{padding:5px 10px;color:#67616f;font-size:9px;text-transform:uppercase;letter-spacing:.08em}
#gpDashboardModern .gpm-row:not(.head):hover{background:#19161f}
#gpDashboardModern .gpm-client{font-size:12px;color:#e2dfe6;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#gpDashboardModern .gpm-small{font-size:10px;color:#77717e}
#gpDashboardModern .gpm-status{font-size:9px;padding:4px 7px;border-radius:999px;display:inline-block;background:rgba(52,211,153,.10);color:#6ee7b7}
#gpDashboardModern .gpm-empty{padding:30px 10px;text-align:center;color:#77717e;font-size:12px}
#gpDashboardModern .gpm-finance{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#gpDashboardModern .gpm-fin-item{padding:13px;border-radius:12px;background:#121117;border:1px solid #24212a}
#gpDashboardModern .gpm-fin-label{font-size:10px;color:#77717e}
#gpDashboardModern .gpm-fin-value{font-size:16px;font-weight:750;color:#f3f0f6;margin-top:3px}
#gpDashboardModern .gpm-fin-value.green{color:#6ee7b7}
#gpDashboardModern .gpm-fin-value.red{color:#fb7185}
@media(max-width:1050px){#gpDashboardModern .gpm-kpis{grid-template-columns:repeat(2,1fr)}#gpDashboardModern .gpm-main,#gpDashboardModern .gpm-bottom{grid-template-columns:1fr}}
@media(max-width:620px){#gpDashboardModern .gpm-head{align-items:flex-start;flex-direction:column;gap:8px}#gpDashboardModern .gpm-kpis{grid-template-columns:1fr 1fr;gap:9px}#gpDashboardModern .gpm-kpi{min-height:112px;padding:14px}#gpDashboardModern .gpm-value{font-size:21px}#gpDashboardModern .gpm-donut-wrap{flex-direction:column;gap:16px}.gpm-chart{gap:3px!important}.gpm-row{grid-template-columns:1.4fr .8fr .7fr!important}.gpm-row>:nth-child(2){display:none}}
`;document.head.appendChild(s)}
async function getOrg(){
 const q=await sb.auth.getSession(),u=q.data?.session?.user;if(!u)return null;
 const p=await sb.from('profiles').select('organization_id').eq('id',u.id).maybeSingle();return p.data?.organization_id||null
}
async function data(){
 const now=new Date(),start=new Date(now.getFullYear(),now.getMonth()-11,1);
 const [c,e,s]=await Promise.all([
  sb.from('clients').select('id,name,value,due_date,status,created_at,start_date,server_id').eq('organization_id',org),
  sb.from('expenses').select('amount,incurred_at').eq('organization_id',org),
  sb.from('servers').select('monthly_cost,purchase_cost,active').eq('organization_id',org)
 ]);
 const clients=c.data||[],expenses=e.data||[],servers=s.data||[];
 const active=clients.filter(x=>x.status==='active'),today=new Date();today.setHours(0,0,0,0);
 const soon=new Date(today);soon.setDate(soon.getDate()+7);
 const soonN=clients.filter(x=>x.due_date&&new Date(String(x.due_date).slice(0,10)+'T00:00:00')>=today&&new Date(String(x.due_date).slice(0,10)+'T00:00:00')<=soon).length;
 const expired=clients.filter(x=>x.due_date&&new Date(String(x.due_date).slice(0,10)+'T00:00:00')<today).length;
 const revenue=active.reduce((a,x)=>a+Number(x.value||0),0);
 const serverCost=servers.filter(x=>x.active!==false).reduce((a,x)=>a+Number(x.monthly_cost||0),0);
 const purchase=servers.filter(x=>x.active!==false).reduce((a,x)=>a+Number(x.purchase_cost||0),0);
 const monthExpense=expenses.filter(x=>{const d=new Date(String(x.incurred_at||'').slice(0,10)+'T00:00:00');return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).reduce((a,x)=>a+Number(x.amount||0),0);
 const profit=revenue-serverCost-monthExpense-purchase;
 const months=[];for(let i=0;i<12;i++){const d=new Date(now.getFullYear(),now.getMonth()-11+i,1);months.push({label:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''),sales:0,revenue:0})}
 for(const x of clients){const raw=x.start_date||x.created_at;if(!raw)continue;const d=new Date(raw);const idx=(d.getFullYear()-start.getFullYear())*12+d.getMonth()-start.getMonth();if(idx>=0&&idx<12){months[idx].sales++;months[idx].revenue+=Number(x.value||0)}}
 return{clients,active,soonN,expired,revenue,serverCost,purchase,monthExpense,profit,months}
}
function mount(){
 const dash=$('dash');if(!dash)return;
 document.querySelectorAll('#gpCreditChart,#gpSalesGrowth').forEach(x=>x.style.display='none');
 let root=$('gpDashboardModern');if(!root){root=document.createElement('div');root.id='gpDashboardModern';dash.prepend(root)}
 return root
}
function render(d){
 const root=mount();if(!root)return;
 const total=d.clients.length,active=d.active.length,inactive=Math.max(0,total-active-d.expired),max=Math.max(...d.months.map(x=>x.sales),1),current=d.months[11];
 const totalRevenue=d.months.reduce((a,x)=>a+x.revenue,0),statusTotal=Math.max(total,1);
 let angle=0;const activeDeg=active/statusTotal*360,expiredDeg=d.expired/statusTotal*360;const inactiveDeg=360-activeDeg-expiredDeg;
 const donut=`conic-gradient(#8b5cf6 0deg ${activeDeg}deg,#fb7185 ${activeDeg}deg ${activeDeg+expiredDeg}deg,#514b59 ${activeDeg+expiredDeg}deg 360deg)`;
 const today=new Date();today.setHours(0,0,0,0);const lim=new Date(today);lim.setDate(lim.getDate()+7);
 const up=d.clients.filter(x=>{if(!x.due_date)return false;const dt=new Date(String(x.due_date).slice(0,10)+'T00:00:00');return dt>=today&&dt<=lim}).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date)).slice(0,6);
 root.innerHTML=`
 <div class="gpm-head"><div><div class="gpm-eyebrow">Visão geral</div><div class="gpm-title">Dashboard</div><div class="gpm-sub">Acompanhe clientes, receita e desempenho do seu negócio em um só lugar.</div></div><div class="gpm-date">${new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}</div></div>
 <div class="gpm-kpis">
  <div class="gpm-kpi"><div class="gpm-icon">◉</div><div class="gpm-label">Total de clientes</div><div class="gpm-value">${total}</div><div class="gpm-meta">${active} ativos no momento</div></div>
  <div class="gpm-kpi gpm-green"><div class="gpm-icon">✓</div><div class="gpm-label">Clientes ativos</div><div class="gpm-value">${active}</div><div class="gpm-meta">Assinaturas em funcionamento</div></div>
  <div class="gpm-kpi gpm-orange"><div class="gpm-icon">◷</div><div class="gpm-label">Vencendo em 7 dias</div><div class="gpm-value">${d.soonN}</div><div class="gpm-meta">Clientes para acompanhar</div></div>
  <div class="gpm-kpi gpm-red"><div class="gpm-icon">!</div><div class="gpm-label">Vencidos</div><div class="gpm-value">${d.expired}</div><div class="gpm-meta">Requerem atenção</div></div>
 </div>
 <div class="gpm-main">
  <div class="gpm-card"><div class="gpm-card-head"><div><div class="gpm-card-title">Crescimento das vendas</div><div class="gpm-card-desc">Novos clientes nos últimos 12 meses</div></div><div class="gpm-total">${current.sales} <span style="font-size:10px;color:#77717e;font-weight:500">este mês</span></div></div><div class="gpm-chart">${d.months.map((x,i)=>`<div class="gpm-bar-col"><div class="gpm-bar-value">${x.sales||''}</div><div class="gpm-bar ${i===11?'current':''}" style="height:${Math.max(x.sales/max*78,2)}%"></div><div class="gpm-month">${esc(x.label)}</div></div>`).join('')}</div></div>
  <div class="gpm-card"><div class="gpm-card-head"><div><div class="gpm-card-title">Carteira de clientes</div><div class="gpm-card-desc">Distribuição atual</div></div></div><div class="gpm-donut-wrap"><div class="gpm-donut" style="background:${donut}"><div class="gpm-donut-hole"><div class="gpm-donut-num">${total}</div><div class="gpm-donut-label">clientes</div></div></div><div class="gpm-legend"><div class="gpm-legend-row"><span class="gpm-dot"></span>Ativos <b style="color:#ddd;margin-left:auto">${active}</b></div><div class="gpm-legend-row"><span class="gpm-dot red"></span>Vencidos <b style="color:#ddd;margin-left:auto">${d.expired}</b></div><div class="gpm-legend-row"><span class="gpm-dot gray"></span>Outros <b style="color:#ddd;margin-left:auto">${inactive}</b></div></div></div></div>
 </div>
 <div class="gpm-bottom">
  <div class="gpm-card"><div class="gpm-card-head"><div><div class="gpm-card-title">Próximos vencimentos</div><div class="gpm-card-desc">Clientes que precisam de acompanhamento</div></div></div><div class="gpm-list"><div class="gpm-row head"><span>Cliente</span><span>Plano</span><span>Vencimento</span><span>Status</span></div>${up.length?up.map(x=>`<div class="gpm-row"><span class="gpm-client">${esc(x.name)}</span><span class="gpm-small">${esc(x.plan||'Assinatura')}</span><span class="gpm-small">${String(x.due_date).slice(8,10)}/${String(x.due_date).slice(5,7)}</span><span><span class="gpm-status">Acompanhar</span></span></div>`).join(''):'<div class="gpm-empty">Nenhum vencimento nos próximos 7 dias.</div>'}</div></div>
  <div class="gpm-card"><div class="gpm-card-head"><div><div class="gpm-card-title">Resumo financeiro</div><div class="gpm-card-desc">Valores atuais do painel</div></div></div><div class="gpm-finance">
   <div class="gpm-fin-item"><div class="gpm-fin-label">Receita</div><div class="gpm-fin-value">${money(d.revenue)}</div></div>
   <div class="gpm-fin-item"><div class="gpm-fin-label">Despesas</div><div class="gpm-fin-value red">${money(d.monthExpense)}</div></div>
   <div class="gpm-fin-item"><div class="gpm-fin-label">Servidores / mês</div><div class="gpm-fin-value">${money(d.serverCost)}</div></div>
   <div class="gpm-fin-item"><div class="gpm-fin-label">Lucro real</div><div class="gpm-fin-value green">${money(d.profit)}</div></div>
  </div></div>
 </div>`;
 document.querySelectorAll('#dash>.cards,#dash>.panel').forEach(x=>{if(x.id!=='gpDashboardModern')x.style.display='none'});
}
async function boot(){
 style();org=await getOrg();if(!org)return;const d=await data();render(d);
 clearInterval(timer);timer=setInterval(async()=>{const x=await data();render(x)},60000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1400));else setTimeout(boot,1400);
