// GestorPro — correção direta dos KPIs da aba Financeiro.
// Independente dos cálculos do Dashboard. Respeita organização/vendedor via RLS
// e também aplica filtros explícitos para evitar mistura entre vendedores.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FIN_SB_URL = 'https://jbdjfmvdrwdfnuhqrprc.supabase.co';
const FIN_SB_KEY = 'sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80';
const finSb = createClient(FIN_SB_URL, FIN_SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const el = id => document.getElementById(id);
const brl = value => 'R$ ' + Number(value || 0).toFixed(2).replace('.', ',');

function monthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 1);
  const iso = d => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

function setValue(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

async function financeScope() {
  const { data: authData, error: authError } = await finSb.auth.getUser();
  if (authError || !authData?.user) throw authError || new Error('Sessão não encontrada');
  const uid = authData.user.id;

  const { data: profile, error: profileError } = await finSb
    .from('profiles')
    .select('organization_id,role')
    .eq('id', uid)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.organization_id) throw new Error('Perfil sem organização');

  const role = String(profile.role || '').toLowerCase();
  const manager = ['master', 'owner', 'admin', 'gestor', 'manager'].includes(role);
  return { uid, org: profile.organization_id, manager };
}

async function loadFinanceDirect() {
  try {
    const scope = await financeScope();
    const { start, end } = monthRange();

    let clientsQ = finSb
      .from('clients')
      .select('value,status,organization_id,seller_user_id')
      .eq('organization_id', scope.org);
    let serversQ = finSb
      .from('servers')
      .select('credit_balance,credit_cost,organization_id,seller_user_id,active')
      .eq('organization_id', scope.org);
    let txQ = finSb
      .from('credit_transactions')
      .select('quantity,unit_cost,total_cost,created_at,organization_id,seller_user_id,type')
      .eq('organization_id', scope.org)
      .gte('created_at', start)
      .lt('created_at', end);
    let expensesQ = finSb
      .from('expenses')
      .select('amount,incurred_at,organization_id,seller_user_id')
      .eq('organization_id', scope.org)
      .gte('incurred_at', start)
      .lt('incurred_at', end);

    if (!scope.manager) {
      clientsQ = clientsQ.eq('seller_user_id', scope.uid);
      serversQ = serversQ.eq('seller_user_id', scope.uid);
      txQ = txQ.eq('seller_user_id', scope.uid);
      expensesQ = expensesQ.eq('seller_user_id', scope.uid);
    }

    const [clientsR, serversR, txR, expensesR] = await Promise.all([clientsQ, serversQ, txQ, expensesQ]);

    // Não deixar uma consulta com erro impedir as outras de preencherem os cards.
    const clients = clientsR.error ? [] : (clientsR.data || []);
    const servers = serversR.error ? [] : (serversR.data || []);
    const tx = txR.error ? [] : (txR.data || []);
    const expenses = expensesR.error ? [] : (expensesR.data || []);

    const revenue = clients
      .filter(c => String(c.status || '').toLowerCase() === 'active')
      .reduce((sum, c) => sum + Number(c.value || 0), 0);

    // Saldo disponível de créditos dos servidores pertencentes ao usuário.
    const creditBalance = servers.reduce((sum, s) => sum + Number(s.credit_balance || 0), 0);

    // Custo dos créditos efetivamente consumidos no mês.
    const creditConsumed = tx.reduce((sum, t) => {
      const explicit = Number(t.total_cost);
      if (Number.isFinite(explicit) && explicit !== 0) return sum + explicit;
      return sum + (Number(t.quantity || 0) * Number(t.unit_cost || 0));
    }, 0);

    const expense = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const profit = revenue - creditConsumed - expense;

    // Estes são EXATAMENTE os IDs dos cards que aparecem na aba Financeiro.
    setValue('fRevenue', brl(revenue));
    setValue('fCredit', String(creditBalance));
    setValue('fCreditDiscount', brl(creditConsumed));
    setValue('fExpense', brl(expense));
    setValue('fProfit', brl(profit));

    // Compatibilidade com a versão antiga da aba Financeiro, caso algum card exista.
    const monthlyServerCost = servers.filter(s => s.active !== false).reduce((sum, s) => sum + Number(s.monthly_cost || 0), 0);
    const purchaseCost = servers.filter(s => s.active !== false).reduce((sum, s) => sum + Number(s.purchase_cost || 0), 0);
    setValue('fServer', brl(monthlyServerCost));
    setValue('fPurchase', brl(purchaseCost));
    setValue('fOperating', brl(revenue - monthlyServerCost - expense));

    // Ajuda a diagnosticar no console sem bloquear a tela.
    const errors = [clientsR, serversR, txR, expensesR].filter(r => r.error).map(r => r.error.message);
    if (errors.length) console.warn('GestorPro Financeiro:', errors);
  } catch (err) {
    console.error('GestorPro Financeiro — erro ao carregar KPIs:', err);
  }
}

function runWhenFinanceIsVisible() {
  const finance = document.getElementById('finance');
  if (!finance) return;
  if (finance.classList.contains('active')) loadFinanceDirect();
}

// Carrega no início e novamente sempre que a aba Financeiro ficar ativa.
loadFinanceDirect();

document.addEventListener('click', event => {
  const button = event.target.closest('[data-v="finance"]');
  if (button) setTimeout(loadFinanceDirect, 50);
});

const financeObserver = new MutationObserver(runWhenFinanceIsVisible);
const financeSection = document.getElementById('finance');
if (financeSection) financeObserver.observe(financeSection, { attributes: true, attributeFilter: ['class'] });

window.gestorProReloadFinance = loadFinanceDirect;
