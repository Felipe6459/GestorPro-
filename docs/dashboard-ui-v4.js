// GestorPro — Dashboard V4
// Fonte única dos cartões de resumo do vendedor/administrador.
// Respeita o RLS do Supabase e, para vendedor, reforça o filtro pelo usuário logado.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(
  'https://jbdjfmvdrwdfnuhqrprc.supabase.co',
  'sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
const $ = id => document.getElementById(id);
const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

function isSeller(role) {
  return !['owner', 'admin', 'master'].includes(String(role || '').toLowerCase());
}

function card(label, id, value, note) {
  return `<div class="card"><div>${label}</div><div id="${id}" class="num">${value}</div>${note ? `<div class="muted" style="font-size:11px;margin-top:3px">${note}</div>` : ''}</div>`;
}

function rebuildDashboardCards() {
  const dash = $('dash');
  if (!dash) return;
  const panels = dash.querySelectorAll('.panel');
  const firstPanel = panels[0];
  if (!firstPanel) return;
  let host = $('gpDashboardCardsV4');
  if (!host) {
    host = document.createElement('div');
    host.id = 'gpDashboardCardsV4';
    host.innerHTML = `
      <div class="cards">
        ${card('Clientes', 'totalV4', '—', '')}
        ${card('Ativos', 'activeCountV4', '—', '')}
        ${card('Vencendo em 7 dias', 'soonCountV4', '—', '')}
        ${card('Vencidos', 'expiredCountV4', '—', '')}
      </div>
      <div class="cards" style="margin-top:10px">
        ${card('Receita', 'revenueV4', '—', '')}
        ${card('💳 Créditos', 'creditsV4', '—', 'saldo disponível')}
        ${card('🏷️ Desconto em créditos', 'creditDiscountV4', '—', 'custo consumido')}
        ${card('Despesas/mês', 'expenseV4', '—', '')}
      </div>
      <div class="cards" style="margin-top:10px">
        ${card('📈 Lucro', 'profitV4', '—', 'receita − créditos consumidos − despesas')}
      </div>`;
    dash.insertBefore(host, firstPanel);
    dash.querySelectorAll(':scope > .cards').forEach(x => { if (x !== host) x.style.display = 'none'; });
  }
}

function rebuildFinanceCards() {
  const finance = $('finance');
  if (!finance) return;
  const firstPanel = finance.querySelector('.panel');
  if (!firstPanel) return;
  let host = $('gpFinanceCardsV4');
  if (!host) {
    host = document.createElement('div');
    host.id = 'gpFinanceCardsV4';
    host.innerHTML = `<div class="cards">
      ${card('Receita', 'fRevenueV4', '—', '')}
      ${card('💳 Créditos', 'fCreditsV4', '—', 'saldo disponível')}
      ${card('🏷️ Desconto em créditos', 'fDiscountV4', '—', 'custo consumido')}
      ${card('Despesas', 'fExpenseV4', '—', '')}
    </div><div class="cards" style="margin-top:10px">
      ${card('📈 Lucro', 'fProfitV4', '—', 'receita − créditos consumidos − despesas')}
    </div>`;
    finance.insertBefore(host, firstPanel);
    finance.querySelectorAll(':scope > .cards').forEach(x => { if (x !== host) x.style.display = 'none'; });
  }
}

async function loadV4() {
  rebuildDashboardCards();
  rebuildFinanceCards();
  try {
    const sessionResult = await sb.auth.getSession();
    const session = sessionResult?.data?.session;
    if (!session) return;

    const userId = session.user.id;
    const profileResult = await sb.from('profiles').select('organization_id,role').eq('id', userId).maybeSingle();
    if (profileResult.error) {
      if (/jwt issued at future/i.test(profileResult.error.message || '')) {
        await sb.auth.signOut({ scope: 'local' });
        const msg = $('msg');
        if (msg) { msg.className = 'msg'; msg.textContent = 'Sessão inválida. Faça login novamente para atualizar sua sessão.'; }
        setTimeout(() => location.replace('./index.html?session_reset=1'), 700);
      }
      return;
    }

    const profile = profileResult.data || {};
    const role = profile.role;
    const seller = isSeller(role);
    const org = profile.organization_id;
    if (!org) return;

    let clientsQ = sb.from('clients').select('id,name,value,status,due_date,server_id');
    let serversQ = sb.from('servers').select('id,name,credit_balance,credit_cost,active');
    let txQ = sb.from('credit_transactions').select('quantity,unit_cost,total_cost,type,created_at,server_id,seller_user_id').eq('type', 'consumption');
    let expensesQ = sb.from('expenses').select('amount,incurred_at');

    if (seller) {
      clientsQ = clientsQ.eq('seller_user_id', userId);
      serversQ = serversQ.eq('seller_user_id', userId);
      txQ = txQ.eq('seller_user_id', userId);
    } else {
      clientsQ = clientsQ.eq('organization_id', org);
      serversQ = serversQ.eq('organization_id', org);
      txQ = txQ.eq('organization_id', org);
    }
    expensesQ = expensesQ.eq('organization_id', org);

    const [cr, sr, tr, er] = await Promise.all([clientsQ, serversQ, txQ, expensesQ]);
    if (cr.error || sr.error || tr.error || er.error) return;

    const clients = cr.data || [];
    const servers = sr.data || [];
    const transactions = tr.data || [];
    const expenses = er.data || [];
    const active = clients.filter(c => c.status === 'active');
    const today = new Date(); today.setHours(0,0,0,0);
    const limit = new Date(today); limit.setDate(limit.getDate() + 7);
    const soon = clients.filter(c => c.due_date && new Date(String(c.due_date).slice(0,10)+'T00:00:00') >= today && new Date(String(c.due_date).slice(0,10)+'T00:00:00') <= limit).length;
    const expired = clients.filter(c => c.due_date && new Date(String(c.due_date).slice(0,10)+'T00:00:00') < today).length;
    const revenue = active.reduce((a,c) => a + Number(c.value || 0), 0);
    const credits = servers.reduce((a,s) => a + Number(s.credit_balance || 0), 0);
    const discount = transactions.reduce((a,t) => a + Math.abs(Number(t.total_cost || (Number(t.quantity || 0) * Number(t.unit_cost || 0)) || 0)), 0);
    const now = new Date();
    const expense = expenses.filter(e => { const d = new Date(String(e.incurred_at || '').slice(0,10)+'T00:00:00'); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((a,e) => a + Number(e.amount || 0), 0);
    const profit = revenue - discount - expense;

    $('totalV4').textContent = clients.length;
    $('activeCountV4').textContent = active.length;
    $('soonCountV4').textContent = soon;
    $('expiredCountV4').textContent = expired;
    $('revenueV4').textContent = money(revenue);
    $('creditsV4').textContent = credits;
    $('creditDiscountV4').textContent = money(discount);
    $('expenseV4').textContent = money(expense);
    $('profitV4').textContent = money(profit);

    $('fRevenueV4').textContent = money(revenue);
    $('fCreditsV4').textContent = credits;
    $('fDiscountV4').textContent = money(discount);
    $('fExpenseV4').textContent = money(expense);
    $('fProfitV4').textContent = money(profit);

    const subtitle = document.querySelector('#dashRows')?.closest('.panel')?.querySelector('h3');
    if (subtitle) subtitle.textContent = 'Próximos vencimentos';
    const note = [...document.querySelectorAll('#dash .panel')].find(p => p.textContent.includes('O lucro real'));
    if (note) note.style.display = 'none';
  } catch (e) {
    if (/jwt issued at future/i.test(e?.message || '')) {
      await sb.auth.signOut({ scope: 'local' }).catch(() => {});
      setTimeout(() => location.replace('./index.html?session_reset=1'), 700);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(loadV4, 100));
} else {
  setTimeout(loadV4, 100);
}
setTimeout(loadV4, 1200);
