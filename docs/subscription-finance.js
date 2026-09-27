import{createClient}from'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient('https://jbdjfmvdrwdfnuhqrprc.supabase.co','sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id),money=v=>'R$ '+Number(v||0).toFixed(2).replace('.',','),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let org='',busy=false,stateStart=null,stateInitialized=false;

function isoDate(d){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function fmtDate(v){if(!v)return'—';const s=String(v).slice(0,10);return s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4)}
function today(){return isoDate(new Date())}
function defaultStart(){const d=new Date();d.setDate(1);return isoDate(d)}
function getRangeEnd(){return today()}

async function getOrg(){
 const q=await sb.auth.getSession(),u=q.data?.session?.user;if(!u)return null;
 const{data:p,error}=await sb.from('profiles').select('organization_id').eq('id',u.id).maybeSingle();
 if(error){console.error('[GestorPro caixa]',error);return null}
 return p?.organization_id||null
}
async function getState(){
 if(!org)return null;
 const{data,error}=await sb.from('cash_register_state').select('current_start').eq('organization_id',org).maybeSingle();
 if(error){console.error('[GestorPro caixa state]',error);return null}
 stateInitialized=!!data?.current_start;
 stateStart=data?.current_start||defaultStart();
 return stateStart
}
async function calc(){
 if(!org)return null;
 const start=stateStart||await getState(),end=getRangeEnd();
 const endNext=new Date(end+'T00:00:00');endNext.setDate(endNext.getDate()+1);const endExclusive=isoDate(endNext);
 const[pr,er,tr,cr]=await Promise.all([
  sb.from('payments').select('id,client_id,amount,paid_at,payment_status').eq('organization_id',org).eq('payment_status','paid').gte('paid_at',start+'T00:00:00').lt('paid_at',endExclusive+'T00:00:00'),
  sb.from('expenses').select('amount,incurred_at').eq('organization_id',org).gte('incurred_at',start).lte('incurred_at',end),
  sb.from('credit_transactions').select('quantity,unit_cost,total_cost,type,created_at').eq('organization_id',org).gte('created_at',start+'T00:00:00').lt('created_at',endExclusive+'T00:00:00'),
  sb.from('clients').select('id,start_date').eq('organization_id',org).gte('start_date',start).lte('start_date',end)
 ]);
 const payments=pr.data||[],expenses=er.data||[],tx=tr.data||[],clients=cr.data||[];
 const received=payments.reduce((a,p)=>a+Number(p.amount||0),0);
 const expense=expenses.reduce((a,e)=>a+Number(e.amount||0),0);
 const credit=tx.filter(t=>String(t.type||'').toLowerCase()==='consumption').reduce((a,t)=>a+(Number(t.total_cost)||Math.abs(Number(t.quantity||0))*Number(t.unit_cost||0)),0);
 const result=received-expense-credit;
 return{start,end,received,expense,credit,result,paymentCount:payments.length,clientCount:new Set(payments.map(p=>p.client_id).filter(Boolean)).size,newClients:clients.length}
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

async function getHistory(){
 if(!org)return[];
 const{data,error}=await sb.from('cash_closings').select('id,period_start,period_end,closed_at,revenue,expenses,credit_cost,net_profit,payment_count,renewal_count,new_client_count,client_count').eq('organization_id',org).order('period_end',{ascending:false}).limit(24);
 if(error){console.error('[GestorPro histórico]',error);return[]}return data||[]
}
function ensureCashBox(d,h){
 const f=$('finance');if(!f)return;
 let p=$('gpCashBox');if(!p){p=document.createElement('div');p.id='gpCashBox';p.className='panel';f.insertBefore(p,f.firstChild)}
 const rows=h.map((x,i)=>'<tr><td>'+fmtDate(x.period_start)+' → '+fmtDate(x.period_end)+'</td><td>'+money(x.revenue)+'</td><td>'+x.payment_count+'</td><td>'+x.new_client_count+'</td><td class="'+(Number(x.net_profit)>=0?'pos':'neg')+'">'+money(x.net_profit)+'</td><td>'+fmtDate(x.closed_at)+'</td></tr>').join('');
 const prev=h[1],last=h[0];
 let compare='';if(prev&&last){const a=Number(prev.payment_count||0),b=Number(last.payment_count||0);compare=a===0?(b>0?'Crescimento: novo período com pagamentos registrados.':'Sem pagamentos nos dois períodos.'):'Variação de assinaturas pagas vs. último fechamento: '+(((b-a)/a)*100).toFixed(1).replace('.',',')+'%'}
 p.innerHTML='<div class="gp-cash-head"><div><div class="gp-cash-title">💰 Fechamento de caixa</div><div class="gp-cash-sub">O período atual começa em <span class="gp-cash-period">'+fmtDate(d.start)+'</span> e vai até hoje.</div></div><button id="gpCloseCash" class="secondary">Fechar caixa</button></div><div class="gp-cash-grid"><div><span>Recebido no período</span><b>'+money(d.received)+'</b><small>'+d.paymentCount+' pagamento(s) · '+d.clientCount+' cliente(s)</small></div><div><span>Despesas</span><b>'+money(d.expense)+'</b></div><div><span>Créditos consumidos</span><b>'+money(d.credit)+'</b></div><div><span>Resultado do caixa</span><b class="'+(d.result>=0?'ok':'bad')+'">'+money(d.result)+'</b></div></div><div class="gp-cash-form"><div><label>Data inicial</label><input id="gpCashStart" type="date" value="'+d.start+'"></div><div><label>Data final</label><input id="gpCashEnd" type="date" value="'+d.end+'"></div><button id="gpCloseCash2">Fechar período</button></div><p class="gp-cash-note">Ao fechar, os valores deste período ficam gravados no histórico e o caixa começa novamente no dia seguinte. Nada é apagado das movimentações.</p><div class="gp-cash-history"><h3>📚 Histórico de fechamentos</h3><div class="table"><table><thead><tr><th>Período</th><th>Recebido</th><th>Pagamentos</th><th>Novas assinaturas</th><th>Resultado</th><th>Fechado em</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6">Nenhum fechamento realizado ainda.</td></tr>')+'</tbody></table></div><div class="gp-cash-compare">'+esc(compare)+'</div></div>';
 $('gpCloseCash').onclick=()=>document.getElementById('gpCashEnd')?.focus();
 $('gpCloseCash2').onclick=closeCash;
}
async function closeCash(){
 const start=$('gpCashStart')?.value,end=$('gpCashEnd')?.value;
 if(!start||!end){alert('Informe as duas datas.');return}
 if(stateInitialized&&start!==stateStart){alert('O caixa atual começa em '+fmtDate(stateStart)+'. Use essa data como início para manter os períodos sem buracos.');return}
 if(end>today()){alert('A data final não pode ser futura.');return}
 if(end<start){alert('A data final precisa ser igual ou posterior à inicial.');return}
 if(!confirm('Fechar o caixa de '+fmtDate(start)+' até '+fmtDate(end)+'?\n\nDepois disso, o próximo caixa começa em '+fmtDate((()=>{const d=new Date(end+'T00:00:00');d.setDate(d.getDate()+1);return isoDate(d)})())+'.'))return;
 const b=$('gpCloseCash2');if(b)b.disabled=true;
 const{data,error}=await sb.rpc('gestorpro_close_cash',{p_start:start,p_end:end});
 if(error||data?.error){alert('Não foi possível fechar: '+(error?.message||data?.error||'erro'));if(b)b.disabled=false;return}
 alert('Caixa fechado com sucesso. Próximo período: '+fmtDate(data.next_start));
 stateStart=data.next_start;
 await refresh(true);
}
async function refresh(force=false){
 if(busy&&!force)return;busy=true;
 try{
  if(!org)org=await getOrg();if(!org)return;
  if(!stateStart)stateStart=await getState();if(!stateStart)return;
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