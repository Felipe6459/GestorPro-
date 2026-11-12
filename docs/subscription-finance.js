import{createClient}from'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://jbdjfmvdrwdfnuhqrprc.supabase.co','sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id),money=v=>'R$ '+Number(v||0).toFixed(2).replace('.',','),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let org='',uid='',busy=false,stateStart=null,stateInitialized=false,cashHistory=[];

function isoDate(d){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function fmtDate(v){if(!v)return'—';const s=String(v).slice(0,10);return s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4)}
function fmtDateTime(v){if(!v)return'—';return new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}
function localInput(v){const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function inputIso(v){return new Date(v).toISOString()}
function today(){return isoDate(new Date())}
function defaultStart(){const d=new Date();d.setDate(1);return isoDate(d)}
function getRangeEnd(){return today()}
function localMidnightIso(dateStr){const p=String(dateStr).slice(0,10).split('-').map(Number);return new Date(p[0],p[1]-1,p[2],0,0,0,0).toISOString()}
function nextLocalMidnightIso(dateStr){const p=String(dateStr).slice(0,10).split('-').map(Number);const d=new Date(p[0],p[1]-1,p[2],0,0,0,0);d.setDate(d.getDate()+1);return d.toISOString()}

async function getOrg(){
 const q=await sb.auth.getSession(),u=q.data?.session?.user;if(!u)return null;uid=u.id;
 const{data:p,error}=await sb.from('profiles').select('organization_id').eq('id',u.id).maybeSingle();
 if(error){console.error('[GestorPro caixa]',error);return null}
 return p?.organization_id||null
}
async function getState(){
 if(!org)return null;
 const{data,error}=await sb.rpc('gestorpro_get_seller_cash_state');
 if(error||data?.error){console.error('[GestorPro caixa state]',error||data?.error);return null}
 stateInitialized=!!data?.current_start_at;stateStart=data?.current_start_at||new Date().toISOString();
 cashHistory=Array.isArray(data?.history)?data.history:[];
 return stateStart
}
async function calc(){
 if(!org)return null;
 const start=stateStart||await getState(),end=new Date().toISOString();
 const[pr,er,tr,cr]=await Promise.all([
  sb.from('payments').select('id,client_id,amount,paid_at,payment_status').eq('organization_id',org).eq('seller_user_id',uid).eq('payment_status','paid').gte('paid_at',start).lt('paid_at',end),
  sb.from('expenses').select('amount,created_at').eq('organization_id',org).eq('seller_user_id',uid).gte('created_at',start).lt('created_at',end),
  sb.from('credit_transactions').select('quantity,unit_cost,total_cost,type,created_at').eq('organization_id',org).eq('seller_user_id',uid).gte('created_at',start).lt('created_at',end),
  sb.from('clients').select('id,created_at').eq('organization_id',org).eq('seller_user_id',uid).gte('created_at',start).lt('created_at',end)
 ]);
 const errors=[pr,er,tr,cr].filter(x=>x.error);if(errors.length)console.error('[GestorPro caixa seller]',errors);
 const payments=pr.data||[],expenses=er.data||[],tx=tr.data||[],clients=cr.data||[];
 const received=payments.reduce((a,p)=>a+Number(p.amount||0),0);
 const expense=expenses.reduce((a,e)=>a+Number(e.amount||0),0);
 const credit=tx.filter(t=>String(t.type||'').toLowerCase()==='consumption').reduce((a,t)=>a+(Number(t.total_cost)||Math.abs(Number(t.quantity||0))*Number(t.unit_cost||0)),0);
 return{start,end,received,expense,credit,result:received-expense-credit,paymentCount:payments.length,clientCount:new Set(payments.map(p=>p.client_id).filter(Boolean)).size,newClients:clients.length}
}
function ensureCss(){
 if($('gpCashCss'))return;
 const s=document.createElement('style');s.id='gpCashCss';s.textContent=
 '#finance.gp-finance-loading>.cards{visibility:hidden!important}#gpCashBox{margin-bottom:14px}#gpCashBox .gp-cash-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}#gpCashBox .gp-cash-title{font-size:17px;font-weight:800}#gpCashBox .gp-cash-sub{font-size:11px;color:#817a8d;margin-top:3px}#gpCashBox .gp-cash-period{font-weight:700;color:#c4b5fd}#gpCashBox .gp-cash-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:13px}#gpCashBox .gp-cash-grid>div{padding:13px;border:1px solid #2b253a;border-radius:11px;background:#100e15}#gpCashBox .gp-cash-grid span,#gpCashBox .gp-cash-grid small{display:block;color:#817a8d;font-size:10px}#gpCashBox .gp-cash-grid b{display:block;font-size:18px;margin:5px 0;color:#fff}#gpCashBox .ok{color:#6ee7b7!important}#gpCashBox .bad{color:#fb7185!important}.gp-cash-form{display:grid;grid-template-columns:1fr 1fr auto;gap:9px;align-items:end;margin-top:13px}.gp-cash-form label{display:block;color:#817a8d;font-size:10px;margin-bottom:4px}.gp-cash-form input{width:100%;box-sizing:border-box}.gp-cash-note{font-size:10px;color:#817a8d;margin:10px 0 0}.gp-cash-history{margin-top:12px}.gp-cash-history table{min-width:720px}.gp-cash-history .pos{color:#6ee7b7;font-weight:700}.gp-cash-history .neg{color:#fb7185;font-weight:700}.gp-cash-compare{font-size:10px;color:#817a8d;margin-top:8px}@media(max-width:700px){#gpCashBox .gp-cash-grid{grid-template-columns:1fr 1fr}.gp-cash-form{grid-template-columns:1fr 1fr}.gp-cash-form button{grid-column:1/-1}}';
 document.head.appendChild(s)
 const f=$('finance');if(f)f.classList.add('gp-finance-loading');
}
function updateCards(d){
 const values={fRevenue:d.received,fExpense:d.expense,fServer:0,fPurchase:0,fOperating:d.received-d.expense,fProfit:d.result};
 const set=(id,v)=>{const x=$(id);if(x){const next=money(v);if(x.textContent!==next)x.textContent=next}};
 Object.entries(values).forEach(([id,v])=>set(id,v));
 set('fCreditDiscount',d.credit);
 set('revenue',d.received);set('expenseCost',d.expense);set('serverCost',0);set('serverPurchase',0);set('operatingProfit',d.received-d.expense);set('profit',d.result);
 $('finance')?.classList.remove('gp-finance-loading')
}

async function getHistory(){return cashHistory||[]}
function ensureCashBox(d,h){
 const f=$('finance');if(!f)return;
 let p=$('gpCashBox');if(!p){p=document.createElement('div');p.id='gpCashBox';p.className='panel';f.insertBefore(p,f.firstChild)}
 const rows=h.map(x=>'<tr><td>'+fmtDateTime(x.period_start_at||x.period_start)+' → '+fmtDateTime(x.period_end_at||x.period_end)+'</td><td>'+money(x.revenue)+'</td><td>'+x.payment_count+'</td><td>'+x.new_client_count+'</td><td class="'+(Number(x.net_profit)>=0?'pos':'neg')+'">'+money(x.net_profit)+'</td><td>'+fmtDateTime(x.closed_at)+'</td></tr>').join('');
 const prev=h[1],last=h[0];let compare='';if(prev&&last){const a=Number(prev.payment_count||0),b=Number(last.payment_count||0);compare=a===0?(b>0?'Crescimento: novo período com pagamentos registrados.':'Sem pagamentos nos dois períodos.'):'Variação de pagamentos vs. último fechamento: '+(((b-a)/a)*100).toFixed(1).replace('.',',')+'%'}
 p.innerHTML='<div class="gp-cash-head"><div><div class="gp-cash-title">💰 Meu fechamento de caixa</div><div class="gp-cash-sub">Caixa individual deste vendedor · período iniciado em <span class="gp-cash-period">'+fmtDateTime(d.start)+'</span>.</div></div><button id="gpCloseCash" class="secondary">Fechar meu caixa</button></div><div class="gp-cash-grid"><div><span>Recebido no período</span><b>'+money(d.received)+'</b><small>'+d.paymentCount+' pagamento(s) · '+d.clientCount+' cliente(s)</small></div><div><span>Despesas</span><b>'+money(d.expense)+'</b></div><div><span>Créditos consumidos</span><b>'+money(d.credit)+'</b></div><div><span>Resultado do caixa</span><b class="'+(d.result>=0?'ok':'bad')+'">'+money(d.result)+'</b></div></div><div class="gp-cash-form"><div><label>Início do período</label><input id="gpCashStart" type="datetime-local" value="'+localInput(d.start)+'" readonly></div><div><label>Fechar até (data e hora)</label><input id="gpCashEnd" type="datetime-local" value="'+localInput(d.end)+'" max="'+localInput(d.end)+'"></div><button id="gpCloseCash2">Fechar período</button></div><p class="gp-cash-note">O fechamento é individual. Ao fechar, os valores ficam no histórico e um novo período começa exatamente no horário escolhido. O saldo de créditos disponíveis não é alterado.</p><div class="gp-cash-history"><h3>📚 Meu histórico de fechamentos</h3><div class="table"><table><thead><tr><th>Período</th><th>Recebido</th><th>Pagamentos</th><th>Novos clientes</th><th>Resultado</th><th>Fechado em</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6">Nenhum fechamento realizado ainda.</td></tr>')+'</tbody></table></div><div class="gp-cash-compare">'+esc(compare)+'</div></div>';
 $('gpCloseCash').onclick=()=>document.getElementById('gpCashEnd')?.focus();
 $('gpCloseCash2').onclick=closeCash;
}
async function closeCash(){
 const start=$('gpCashStart')?.value,end=$('gpCashEnd')?.value;
 if(!start||!end){alert('Informe a data e a hora do fechamento.');return}
 const startIso=stateStart,endIso=inputIso(end);
 if(new Date(endIso)>new Date()||new Date(endIso)<=new Date(startIso)){alert('O horário final deve ser posterior ao início e não pode ser futuro.');return}
 if(!confirm('Fechar seu caixa até '+fmtDateTime(endIso)+'?\n\nSomente seus lançamentos serão considerados. O próximo período começará nesse horário.'))return;
 const b=$('gpCloseCash2');if(b)b.disabled=true;
 const{data,error}=await sb.rpc('gestorpro_close_cash',{p_start_at:startIso,p_end_at:endIso});
 if(error||data?.error){alert('Não foi possível fechar: '+(error?.message||data?.error||'erro'));if(b)b.disabled=false;return}
 alert('Seu caixa foi fechado. O próximo período começa em '+fmtDateTime(data.next_start_at)+'.');
 stateStart=data.next_start_at;
 await getState();
 await refresh(true);
}
async function refresh(force=false){
 if(busy&&!force)return;busy=true;
 try{
  if(!org)org=await getOrg();if(!org)return;
  stateStart=await getState();if(!stateStart)return;
  const d=await calc(),h=await getHistory();ensureCss();ensureCashBox(d,h);updateCards(d);
 }catch(e){console.error('[GestorPro caixa]',e)}finally{busy=false}
}
function addPaymentButtons(){
 const rows=$('clientRows');if(!rows)return;
 rows.querySelectorAll('tr').forEach(tr=>{
  if(tr.querySelector('.gpSubPay'))return;const edit=tr.querySelector('[data-edit]');if(!edit)return;
  const id=edit.dataset.edit,b=document.createElement('button');b.className='gpSubPay';b.textContent='Receber + renovar';b.title='Registra o pagamento e acrescenta 30 dias';
  b.onclick=async()=>{b.disabled=true;const name=tr.querySelector('strong')?.textContent||'cliente';const raw=(tr.children[4]?.textContent||'').replace(/[^0-9,]/g,'').replace('.','').replace(',','.');const amount=Number(prompt('Valor recebido de '+name+':',raw)||0);if(!amount||amount<=0){b.disabled=false;return}const method=prompt('Forma de pagamento (Pix, dinheiro, cartão etc.):','Pix')||null;const r=await sb.rpc('gestorpro_register_client_payment',{p_client_id:id,p_amount:amount,p_payment_method:method});if(r.error||r.data?.error){alert('Não foi possível registrar: '+(r.error?.message||r.data?.error||'erro'));b.disabled=false;return}const returnedDue=r.data?.due_date;if(returnedDue){const dueCell=tr.children[5];if(dueCell)dueCell.textContent=fmtDate(returnedDue)}b.textContent='Pago + renovado';await refresh(true)};
  edit.parentElement.appendChild(b)
 })
}
async function boot(){
 ensureCss();if(!org)org=await getOrg();if(!stateStart)stateStart=await getState();await refresh();addPaymentButtons();
 new MutationObserver(()=>{addPaymentButtons()}).observe(document.body,{childList:true,subtree:true});
 setInterval(refresh,5000);setInterval(addPaymentButtons,1500)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1200));else setTimeout(boot,1200);