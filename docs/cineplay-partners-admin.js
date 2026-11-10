import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient("https://jbdjfmvdrwdfnuhqrprc.supabase.co", "sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80", { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const $ = (id) => document.getElementById(id);
const money = (v) => "R$ " + Number(v || 0).toFixed(2).replace(".", ",");
const date = (v) => v ? String(v).slice(8,10) + "/" + String(v).slice(5,7) + "/" + String(v).slice(0,4) : "—";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
let loading = false;

async function call(action, payload = {}) {
  const { data, error } = await sb.functions.invoke("cineplay-partners", { body: { action, ...payload } });
  if (error) {
    let detail = "";
    try { if (error.context) { const body = await error.context.json(); detail = body?.error || body?.message || ""; } } catch (_) {}
    throw new Error(detail || error.message || "Falha ao comunicar com o módulo de parceiros.");
  }
  if (data?.error) throw new Error(data.error);
  return data || {};
}

function style() {
  if ($("gpPartnerAdminStyle")) return;
  const s = document.createElement("style");
  s.id = "gpPartnerAdminStyle";
  s.textContent = "#gpPartnersAdminView .gp-pa-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}" +
    "#gpPartnersAdminView .gp-pa-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}" +
    "#gpPartnersAdminView .gp-pa-kpi{background:#100e16;border:1px solid #30264d;border-radius:12px;padding:14px;min-width:0}" +
    "#gpPartnersAdminView .gp-pa-kpi small{display:block;color:#938ba1;font-size:11px}" +
    "#gpPartnersAdminView .gp-pa-kpi b{display:block;font-size:22px;margin-top:6px;overflow-wrap:anywhere}" +
    "#gpPartnersAdminView .gp-pa-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}" +
    "#gpPartnersAdminView .gp-pa-form .field{min-width:0}" +
    "#gpPartnersAdminView .gp-pa-form input,#gpPartnersAdminView .gp-pa-form select{width:100%;box-sizing:border-box;min-width:0}" +
    "#gpPartnersAdminView .gp-pa-status{min-height:20px;color:#c4b5fd;font-size:12px;margin-top:8px}" +
    "#gpPartnersAdminView .gp-pa-status.ok{color:#86efac}" +
    "#gpPartnersAdminView .gp-pa-table table{min-width:920px}" +
    "#gpPartnersAdminView .gp-pa-table button{white-space:nowrap;padding:7px 9px;font-size:11px}" +
    "#gpPartnersAdminView .gp-pa-code{font-family:monospace;color:#c4b5fd}" +
    "#gpPartnersAdminView .gp-pa-muted{color:#938ba1;font-size:11px}" +
    "#gpPartnersAdminView .gp-pa-actions{display:flex;gap:6px;flex-wrap:wrap}" +
    "#gpPartnersAdminView .gp-pa-section{margin-top:14px}" +
    "@media(max-width:760px){#gpPartnersAdminView .gp-pa-kpis{grid-template-columns:1fr 1fr}#gpPartnersAdminView .gp-pa-form{grid-template-columns:1fr 1fr}}" +
    "@media(max-width:480px){#gpPartnersAdminView .gp-pa-form{grid-template-columns:1fr}#gpPartnersAdminView .gp-pa-kpi b{font-size:19px}}";
  document.head.appendChild(s);
}

function addTab() {
  const tabs = document.querySelector(".tabs");
  if (!tabs || $("gpPartnersTab")) return;
  const button = document.createElement("button");
  button.id = "gpPartnersTab";
  button.type = "button";
  button.textContent = "🤝 Parceiros";
  const asaas = $("gpAsaasTabStatic") || $("gpAsaasTab");
  if (asaas?.parentElement === tabs) tabs.insertBefore(button, asaas);
  else tabs.appendChild(button);
  button.onclick = openView;
}

function addView() {
  if ($("gpPartnersAdminView")) return;
  const root = document.querySelector(".wrap") || document.body;
  root.insertAdjacentHTML("beforeend",
    '<section id="gpPartnersAdminView" class="view">' +
      '<div class="panel"><div class="gp-pa-head"><div><h2 style="margin:0">🤝 Gestão de Parceiros</h2><p class="muted">Controle de indicações, comissões, chaves Pix e pagamentos do Cine Player Pro.</p></div><button id="gpPaReload" class="secondary" type="button">Atualizar</button></div>' +
      '<div id="gpPaStatus" class="gp-pa-status"></div><div id="gpPaKpis" class="gp-pa-kpis"></div></div>' +
      '<div class="panel gp-pa-section"><h3>⚙️ Regras de comissão</h3><p class="gp-pa-muted">As alterações valem para novas comissões. Lançamentos já gerados preservam o valor original.</p>' +
      '<form id="gpPaSettingsForm" class="gp-pa-form"><div class="field"><label>Nova assinatura (R$)</label><input id="gpPaCommissionNew" type="number" min="0" step="0.01" required></div>' +
      '<div class="field"><label>Renovação (R$)</label><input id="gpPaCommissionRenew" type="number" min="0" step="0.01" required></div>' +
      '<div class="field"><label>Dia do fechamento mensal</label><input id="gpPaCloseDay" type="number" min="1" max="31" step="1" required></div>' +
      '<div class="row" style="grid-column:1/-1;margin-top:0"><button type="submit">Salvar regras</button></div></form></div>' +
      '<div class="panel gp-pa-section"><h3>➕ Cadastrar parceiro</h3><p class="gp-pa-muted">Crie o acesso individual. O parceiro cadastra a própria chave Pix depois de entrar no painel.</p>' +
      '<form id="gpPaCreateForm" class="gp-pa-form"><div class="field"><label>Nome completo</label><input id="gpPaName" required></div>' +
      '<div class="field"><label>E-mail de acesso</label><input id="gpPaEmail" type="email" required></div>' +
      '<div class="field"><label>Senha inicial (mínimo 8 caracteres)</label><input id="gpPaPassword" type="text" minlength="8" required autocomplete="new-password"></div>' +
      '<div class="row" style="grid-column:1/-1;margin-top:0"><button type="submit">Criar parceiro</button></div></form><div id="gpPaCreated" class="gp-pa-status"></div></div>' +
      '<div class="panel gp-pa-section"><h3>🔗 Vincular cliente indicado</h3><p class="gp-pa-muted">Quando o cliente entrar em contato pelo link do parceiro e for cadastrado no GestorPro, selecione aqui o parceiro responsável. O sistema sincroniza pagamentos já confirmados desse cliente.</p>' +
      '<form id="gpPaReferralForm" class="gp-pa-form"><div class="field"><label>Parceiro</label><select id="gpPaReferralPartner" required></select></div>' +
      '<div class="field"><label>Cliente ainda não vinculado</label><select id="gpPaReferralClient" required></select></div>' +
      '<div class="field" style="justify-content:end"><button type="submit">Vincular indicação</button></div></form></div>' +
      '<div class="panel gp-pa-section"><h3>👥 Parceiros cadastrados</h3><div class="table gp-pa-table"><table><thead><tr><th>Parceiro</th><th>Código</th><th>Clientes</th><th>Próximo fechamento</th><th>Já recebido</th><th>Chave Pix</th><th>Status</th><th>Ações</th></tr></thead><tbody id="gpPaPartnerRows"><tr><td colspan="8">Carregando...</td></tr></tbody></table></div></div>' +
      '<div class="panel gp-pa-section"><h3>💸 Comissões de novas assinaturas</h3><p class="gp-pa-muted">Essas comissões são pagas individualmente após a confirmação do primeiro pagamento do cliente.</p><div class="table gp-pa-table"><table><thead><tr><th>Parceiro</th><th>Cliente</th><th>Data</th><th>Comissão</th><th>Chave Pix</th><th>Ação</th></tr></thead><tbody id="gpPaInitialRows"><tr><td colspan="6">Carregando...</td></tr></tbody></table></div></div>' +
      '<div class="panel gp-pa-section"><h3>🔁 Comissões de renovações</h3><p class="gp-pa-muted">Veja quais renovações já estão liberadas para o fechamento, quais entram no próximo e quais ainda aguardam completar 30 dias.</p><div class="table gp-pa-table"><table><thead><tr><th>Parceiro</th><th>Cliente</th><th>Renovou em</th><th>Elegível em</th><th>Comissão</th><th>Situação</th></tr></thead><tbody id="gpPaRenewalRows"><tr><td colspan="6">Carregando...</td></tr></tbody></table></div></div>' +
    '</section>'
  );
  $("gpPaReload").onclick = load;
  $("gpPaSettingsForm").onsubmit = saveSettings;
  $("gpPaCreateForm").onsubmit = createPartner;
  $("gpPaReferralForm").onsubmit = assignReferral;
}

function openView() {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  $("gpPartnersAdminView")?.classList.add("active");
  document.querySelectorAll(".tabs button").forEach((button) => button.classList.remove("active"));
  $("gpPartnersTab")?.classList.add("active");
  load();
}

function status(message, ok = false, target = "gpPaStatus") {
  const node = $(target);
  if (!node) return;
  node.textContent = message || "";
  node.className = "gp-pa-status" + (ok ? " ok" : "");
}

async function load() {
  if (loading) return;
  loading = true;
  status("Carregando dados dos parceiros...");
  try {
    const data = await call("admin_dashboard");
    render(data);
    status("Dados atualizados.", true);
  } catch (error) {
    status("Não foi possível carregar: " + error.message);
  } finally {
    loading = false;
  }
}

function render(data) {
  const s = data.summary || {};
  const kpis = [
    ["Parceiros", s.partners_count || 0],
    ["Clientes indicados", s.referrals_count || 0],
    ["Renovações para pagar no fechamento", money(s.renewals_due || 0)],
    ["Total já recebido pelos parceiros", money(s.paid_total || 0)],
  ];
  $("gpPaKpis").innerHTML = kpis.map((item) =>
    '<div class="gp-pa-kpi"><small>' + esc(item[0]) + '</small><b>' + esc(item[1]) + '</b></div>'
  ).join("");

  $("gpPaCommissionNew").value = Number(data.settings?.commission_subscription ?? 10);
  $("gpPaCommissionRenew").value = Number(data.settings?.commission_renewal ?? 5);
  $("gpPaCloseDay").value = Number(data.settings?.monthly_close_day ?? 10);

  const activePartners = (data.partners || []).filter((p) => p.status === "active");
  $("gpPaReferralPartner").innerHTML = activePartners.map((p) =>
    '<option value="' + esc(p.id) + '">' + esc(p.full_name) + ' · ' + esc(p.referral_code) + '</option>'
  ).join("") || '<option value="">Nenhum parceiro ativo</option>';
  $("gpPaReferralClient").innerHTML = (data.unassigned_clients || []).map((c) =>
    '<option value="' + esc(c.id) + '">' + esc(c.name) + ' · ' + esc(c.status || "sem status") + ' · vence ' + esc(date(c.due_date)) + '</option>'
  ).join("") || '<option value="">Nenhum cliente disponível</option>';

  $("gpPaPartnerRows").innerHTML = (data.partners || []).map((p) => {
    const pixLabel = p.pix_key ? (p.pix_key_type || "Pix") + " · " + p.pix_key : "Não cadastrada";
    const monthlyButton = p.renewal_due_amount > 0 && p.pix_key
      ? '<button type="button" class="gpPaPayRenewals" data-id="' + esc(p.id) + '" data-amount="' + Number(p.renewal_due_amount) + '">Pagar renovações</button>'
      : '<button type="button" class="secondary" disabled title="Sem comissões liberadas ou sem chave Pix">Pagar renovações</button>';
    return '<tr><td><b>' + esc(p.full_name) + '</b><br><span class="gp-pa-muted">' + esc(p.email) + '</span></td>' +
      '<td><span class="gp-pa-code">' + esc(p.referral_code) + '</span><br><button type="button" class="secondary gpPaCopyLink" data-url="' + esc(p.referral_url) + '">Copiar link</button></td>' +
      '<td>' + Number(p.referrals_count || 0) + '<br><span class="gp-pa-muted">' + Number(p.active_clients || 0) + ' ativos</span></td>' +
      '<td><b>' + money(p.renewal_next_amount) + '</b><br><span class="gp-pa-muted">Fechamento ' + esc(date(data.dates?.nextClose)) + '</span></td>' +
      '<td>' + money(p.received_amount) + '</td><td>' + esc(pixLabel) + '<br>' +
      (p.pix_key ? '<button type="button" class="secondary gpPaCopyPix" data-pix="' + esc(p.pix_key) + '">Copiar Pix</button>' : '') + '</td>' +
      '<td>' + (p.status === "active" ? "Ativo" : "Suspenso") + '</td>' +
      '<td><div class="gp-pa-actions">' + monthlyButton +
      '<button type="button" class="secondary gpPaToggle" data-id="' + esc(p.id) + '" data-status="' + esc(p.status) + '">' +
      (p.status === "active" ? "Suspender" : "Ativar") + '</button></div></td></tr>';
  }).join("") || '<tr><td colspan="8">Nenhum parceiro cadastrado.</td></tr>';

  $("gpPaInitialRows").innerHTML = (data.pending_subscriptions || []).map((c) =>
    '<tr><td>' + esc(c.partner_name) + '</td><td>' + esc(c.client_name) + '</td><td>' + esc(date(c.earned_at)) + '</td>' +
    '<td><b>' + money(c.amount) + '</b></td><td>' + (c.pix_key ? esc(c.pix_key) : "Chave não cadastrada") + '</td><td>' +
    (c.pix_key ? '<button type="button" class="gpPaPayInitial" data-id="' + esc(c.id) + '" data-amount="' + Number(c.amount) + '">Marcar como pago</button>' :
      '<button type="button" disabled>Pix pendente</button>') + '</td></tr>'
  ).join("") || '<tr><td colspan="6">Nenhuma comissão de nova assinatura aguardando pagamento.</td></tr>';

  $("gpPaRenewalRows").innerHTML = (data.pending_renewals || []).map((c) => {
    const state = c.eligible_for_current_close ? "Liberada para fechamento" :
      (c.eligible_for_next_close ? "Prevista para " + date(data.dates?.nextClose) : "Aguardando ciclo de 30 dias");
    return '<tr><td>' + esc(c.partner_name) + '</td><td>' + esc(c.client_name) + '</td>' +
      '<td>' + esc(date(c.earned_at)) + '</td><td>' + esc(date(c.eligible_at)) + '</td>' +
      '<td><b>' + money(c.amount) + '</b></td><td>' + state + '</td></tr>';
  }).join("") || '<tr><td colspan="6">Nenhuma comissão de renovação pendente.</td></tr>';

  bindRows();
}

function bindRows() {
  document.querySelectorAll(".gpPaCopyPix").forEach((button) => {
    button.onclick = async () => {
      try { await navigator.clipboard.writeText(button.dataset.pix || ""); status("Chave Pix copiada.", true); }
      catch (_) { status("Não foi possível copiar a chave Pix neste navegador."); }
    };
  });
  document.querySelectorAll(".gpPaCopyLink").forEach((button) => {
    button.onclick = async () => {
      try { await navigator.clipboard.writeText(button.dataset.url || ""); status("Link de indicação copiado.", true); }
      catch (_) { status("Não foi possível copiar o link neste navegador."); }
    };
  });
  document.querySelectorAll(".gpPaPayInitial").forEach((button) => {
    button.onclick = async () => {
      if (!confirm("Confirma que você já realizou o Pix de " + money(button.dataset.amount) + " e deseja registrar esta comissão como paga?")) return;
      button.disabled = true;
      try { await call("mark_subscription_paid", { commission_id: button.dataset.id }); status("Pagamento individual registrado.", true); await load(); }
      catch (error) { status("Erro ao registrar pagamento: " + error.message); button.disabled = false; }
    };
  });
  document.querySelectorAll(".gpPaPayRenewals").forEach((button) => {
    button.onclick = async () => {
      if (!confirm("Confirma que você já realizou o Pix de " + money(button.dataset.amount) + " para este parceiro e deseja fechar as renovações elegíveis?")) return;
      button.disabled = true;
      try {
        const result = await call("pay_monthly_renewals", { partner_id: button.dataset.id });
        status(result.paid ? "Fechamento registrado: " + money(result.amount) + "." : "Não há renovações elegíveis neste fechamento.", true);
        await load();
      } catch (error) { status("Erro no fechamento: " + error.message); button.disabled = false; }
    };
  });
  document.querySelectorAll(".gpPaToggle").forEach((button) => {
    button.onclick = async () => {
      const next = button.dataset.status === "active" ? "suspended" : "active";
      if (!confirm((next === "suspended" ? "Suspender" : "Reativar") + " este parceiro?")) return;
      button.disabled = true;
      try { await call("update_partner", { partner_id: button.dataset.id, status: next }); await load(); }
      catch (error) { status("Erro ao atualizar parceiro: " + error.message); button.disabled = false; }
    };
  });
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    await call("save_settings", {
      commission_subscription: Number($("gpPaCommissionNew").value),
      commission_renewal: Number($("gpPaCommissionRenew").value),
      monthly_close_day: Number($("gpPaCloseDay").value),
    });
    status("Regras de comissão salvas. Os lançamentos existentes não foram alterados.", true);
    await load();
  } catch (error) { status("Erro ao salvar regras: " + error.message); }
}

async function createPartner(event) {
  event.preventDefault();
  const button = $("gpPaCreateForm").querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "Criando...";
  status("", false, "gpPaCreated");
  try {
    const result = await call("create_partner", {
      full_name: $("gpPaName").value.trim(),
      email: $("gpPaEmail").value.trim(),
      password: $("gpPaPassword").value,
    });
    status("Parceiro criado. Painel: " + result.partner_portal_url + " · Link de indicação: " + result.referral_url, true, "gpPaCreated");
    $("gpPaCreateForm").reset();
    await load();
  } catch (error) { status("Erro ao criar parceiro: " + error.message, false, "gpPaCreated"); }
  finally { button.disabled = false; button.textContent = "Criar parceiro"; }
}

async function assignReferral(event) {
  event.preventDefault();
  const partnerId = $("gpPaReferralPartner").value;
  const clientId = $("gpPaReferralClient").value;
  if (!partnerId || !clientId) { status("Selecione um parceiro e um cliente."); return; }
  try {
    const result = await call("assign_referral", { partner_id: partnerId, client_id: clientId });
    status("Cliente vinculado. " + (result.generated_commissions || []).length + " comissão(ões) identificada(s) no histórico de pagamentos.", true);
    await load();
  } catch (error) { status("Erro ao vincular cliente: " + error.message); }
}

async function boot() {
  style();
  try {
    await call("admin_dashboard");
    addTab();
    addView();
    await load();
  } catch (error) {
    if (!/restrito|acesso|sessão/i.test(error.message)) console.warn("Gestão de parceiros:", error);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 1100));
else setTimeout(boot, 1100);