import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const allowedPixTypes = ["cpf", "cnpj", "email", "phone", "random"];
const paidStatuses = ["paid", "received", "confirmed", "payment_received", "succeeded", "approved"];
const landingBase = "https://felipe6459.github.io/GestorPro-/indicar.html?ref=";
const partnerPortalUrl = "https://felipe6459.github.io/GestorPro-/parceiro.html";

async function getUser(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

async function getManagerContext(userId: string) {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id,organization_id,role,full_name")
    .eq("id", userId)
    .maybeSingle();
  if (error || !profile) return null;

  const role = String(profile.role || "").toLowerCase();
  let organizationId = profile.organization_id;

  if (role !== "master" && role !== "owner") {
    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id,role,status")
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("role", "owner")
      .maybeSingle();
    if (!membership) return null;
    organizationId = membership.organization_id;
  }

  if (!organizationId && role === "owner") {
    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id,role,status")
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("role", "owner")
      .maybeSingle();
    organizationId = membership?.organization_id || null;
  }
  if (!organizationId) return null;
  return { userId, organizationId, role };
}

async function ensureSettings(organizationId: string) {
  const { error: upsertError } = await admin
    .from("cineplay_partner_settings")
    .upsert({ organization_id: organizationId }, { onConflict: "organization_id" });
  if (upsertError) throw upsertError;

  const { data, error } = await admin
    .from("cineplay_partner_settings")
    .select("organization_id,commission_subscription,commission_renewal,monthly_close_day,timezone")
    .eq("organization_id", organizationId)
    .single();
  if (error) throw error;
  return data;
}

function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value: Record<string, string> = {};
  for (const part of parts) value[part.type] = part.value;
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day) };
}

function closeDateForMonth(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(1, day), lastDay);
  return String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(safeDay).padStart(2, "0");
}

function monthShift(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function closeDates(day: number, timezone = "America/Maceio") {
  const todayParts = localDateParts(new Date(), timezone);
  const today = closeDateForMonth(todayParts.year, todayParts.month, todayParts.day);
  const thisMonth = closeDateForMonth(todayParts.year, todayParts.month, day);
  const previousMonth = monthShift(todayParts.year, todayParts.month, -1);
  const nextMonth = monthShift(todayParts.year, todayParts.month, 1);
  const currentClose = today >= thisMonth
    ? thisMonth
    : closeDateForMonth(previousMonth.year, previousMonth.month, day);
  const nextClose = today < thisMonth
    ? thisMonth
    : closeDateForMonth(nextMonth.year, nextMonth.month, day);
  return { today, currentClose, nextClose };
}

function cutoffIso(date: string) {
  // O fechamento usa o início do dia no fuso de Alagoas (UTC-03:00).
  return new Date(date + "T00:00:00-03:00").toISOString();
}

function sum(rows: any[], predicate: (row: any) => boolean) {
  return rows.filter(predicate).reduce((total, row) => total + Number(row.amount || 0), 0);
}

function shareUrl(code: string) {
  return landingBase + encodeURIComponent(code);
}

async function loadAdminDashboard(organizationId: string, settings: any) {
  const [partnersQ, referralsQ, commissionsQ, clientsQ] = await Promise.all([
    admin.from("cineplay_partners")
      .select("id,user_id,full_name,email,referral_code,status,pix_key_type,pix_key,pix_holder_name,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    admin.from("cineplay_partner_referrals")
      .select("id,partner_id,client_id,client_name_snapshot,first_paid_at,status,referred_at")
      .eq("organization_id", organizationId),
    admin.from("cineplay_partner_commissions")
      .select("id,partner_id,referral_id,client_id,commission_type,amount,status,earned_at,eligible_at,paid_at,cycle_due_date")
      .eq("organization_id", organizationId)
      .order("earned_at", { ascending: false })
      .limit(1500),
    admin.from("clients")
      .select("id,name,status,due_date,whatsapp")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  for (const result of [partnersQ, referralsQ, commissionsQ, clientsQ]) {
    if (result.error) throw result.error;
  }

  const partners = partnersQ.data || [];
  const referrals = referralsQ.data || [];
  const commissions = commissionsQ.data || [];
  const clients = clientsQ.data || [];
  const clientMap = new Map(clients.map((client: any) => [client.id, client]));
  const partnerMap = new Map(partners.map((partner: any) => [partner.id, partner]));
  const referralMap = new Map(referrals.map((referral: any) => [referral.id, referral]));
  const assignedClientIds = new Set(referrals.map((referral: any) => referral.client_id).filter(Boolean));

  const dates = closeDates(Number(settings.monthly_close_day || 10), settings.timezone || "America/Maceio");
  const currentCutoff = Date.parse(cutoffIso(dates.currentClose));
  const nextCutoff = Date.parse(cutoffIso(dates.nextClose));

  const partnerRows = partners.map((partner: any) => {
    const ownReferrals = referrals.filter((referral: any) => referral.partner_id === partner.id);
    const ownCommissions = commissions.filter((commission: any) => commission.partner_id === partner.id);
    const initialPending = sum(ownCommissions, (c) => c.status === "pending" && c.commission_type === "subscription");
    const renewalDue = sum(ownCommissions, (c) =>
      c.status === "pending" && c.commission_type === "renewal" && Date.parse(c.eligible_at) < currentCutoff
    );
    const renewalNext = sum(ownCommissions, (c) =>
      c.status === "pending" && c.commission_type === "renewal" &&
      Date.parse(c.eligible_at) >= currentCutoff && Date.parse(c.eligible_at) < nextCutoff
    );
    const received = sum(ownCommissions, (c) => c.status === "paid");
    const activeReferralCount = ownReferrals.filter((referral: any) => {
      if (!referral.first_paid_at) return false;
      const client = clientMap.get(referral.client_id);
      return !!client && ["active", "expiring"].includes(String(client.status || "").toLowerCase());
    }).length;
    return {
      ...partner,
      referral_url: shareUrl(partner.referral_code),
      referrals_count: ownReferrals.length,
      active_clients: activeReferralCount,
      pending_subscription_amount: initialPending,
      renewal_due_amount: renewalDue,
      renewal_next_amount: renewalNext,
      available_amount: initialPending + renewalDue,
      received_amount: received,
      waiting_renewal_count: activeReferralCount,
      waiting_renewal_amount: activeReferralCount * Number(settings.commission_renewal || 5),
    };
  });

  const pendingSubscriptions = commissions
    .filter((commission: any) => commission.status === "pending" && commission.commission_type === "subscription")
    .map((commission: any) => {
      const referral = referralMap.get(commission.referral_id);
      const partner = partnerMap.get(commission.partner_id);
      const client = clientMap.get(commission.client_id);
      return {
        id: commission.id,
        partner_id: commission.partner_id,
        partner_name: partner?.full_name || "Parceiro",
        client_name: client?.name || referral?.client_name_snapshot || "Cliente",
        amount: commission.amount,
        earned_at: commission.earned_at,
        pix_key: partner?.pix_key || "",
        pix_key_type: partner?.pix_key_type || "",
      };
    });

  const pendingRenewals = commissions
    .filter((commission: any) => commission.status === "pending" && commission.commission_type === "renewal")
    .map((commission: any) => {
      const referral = referralMap.get(commission.referral_id);
      const partner = partnerMap.get(commission.partner_id);
      const client = clientMap.get(commission.client_id);
      const eligibleAt = Date.parse(commission.eligible_at);
      return {
        id: commission.id,
        partner_id: commission.partner_id,
        partner_name: partner?.full_name || "Parceiro",
        client_name: client?.name || referral?.client_name_snapshot || "Cliente",
        amount: commission.amount,
        earned_at: commission.earned_at,
        eligible_at: commission.eligible_at,
        eligible_for_current_close: eligibleAt < currentCutoff,
        eligible_for_next_close: eligibleAt >= currentCutoff && eligibleAt < nextCutoff,
      };
    });

  const renewalDueTotal = sum(commissions, (c) =>
    c.status === "pending" && c.commission_type === "renewal" && Date.parse(c.eligible_at) < currentCutoff
  );
  const renewalNextTotal = sum(commissions, (c) =>
    c.status === "pending" && c.commission_type === "renewal" &&
    Date.parse(c.eligible_at) >= currentCutoff && Date.parse(c.eligible_at) < nextCutoff
  );
  const paidTotal = sum(commissions, (c) => c.status === "paid");
  const pendingInitialTotal = sum(commissions, (c) =>
    c.status === "pending" && c.commission_type === "subscription"
  );

  return {
    settings,
    dates,
    summary: {
      partners_count: partners.length,
      referrals_count: referrals.length,
      pending_subscriptions: pendingInitialTotal,
      renewals_due: renewalDueTotal,
      renewals_next_close: renewalNextTotal,
      paid_total: paidTotal,
    },
    partners: partnerRows,
    pending_subscriptions: pendingSubscriptions,
    pending_renewals: pendingRenewals,
    unassigned_clients: clients
      .filter((client: any) => !assignedClientIds.has(client.id))
      .map((client: any) => ({
        id: client.id,
        name: client.name,
        status: client.status,
        due_date: client.due_date,
        whatsapp: client.whatsapp,
      })),
  };
}

async function loadPartnerDashboard(partner: any, settings: any) {
  const [referralsQ, commissionsQ] = await Promise.all([
    admin.from("cineplay_partner_referrals")
      .select("id,client_id,client_name_snapshot,first_paid_at,status,referred_at")
      .eq("partner_id", partner.id)
      .eq("status", "active")
      .order("referred_at", { ascending: false }),
    admin.from("cineplay_partner_commissions")
      .select("id,referral_id,client_id,commission_type,amount,status,earned_at,eligible_at,paid_at,cycle_due_date")
      .eq("partner_id", partner.id)
      .order("earned_at", { ascending: false })
      .limit(500),
  ]);
  if (referralsQ.error) throw referralsQ.error;
  if (commissionsQ.error) throw commissionsQ.error;

  const referrals = referralsQ.data || [];
  const commissions = commissionsQ.data || [];
  const ids = referrals.map((referral: any) => referral.client_id).filter(Boolean);
  let clients: any[] = [];
  if (ids.length) {
    const result = await admin.from("clients").select("id,name,status,due_date").in("id", ids);
    if (result.error) throw result.error;
    clients = result.data || [];
  }
  const clientMap = new Map(clients.map((client: any) => [client.id, client]));
  const referralMap = new Map(referrals.map((referral: any) => [referral.id, referral]));
  const dates = closeDates(Number(settings.monthly_close_day || 10), settings.timezone || "America/Maceio");
  const currentCutoff = Date.parse(cutoffIso(dates.currentClose));
  const nextCutoff = Date.parse(cutoffIso(dates.nextClose));

  const initialPending = sum(commissions, (c) => c.status === "pending" && c.commission_type === "subscription");
  const renewalDue = sum(commissions, (c) =>
    c.status === "pending" && c.commission_type === "renewal" && Date.parse(c.eligible_at) < currentCutoff
  );
  const renewalNext = sum(commissions, (c) =>
    c.status === "pending" && c.commission_type === "renewal" &&
    Date.parse(c.eligible_at) >= currentCutoff && Date.parse(c.eligible_at) < nextCutoff
  );
  const received = sum(commissions, (c) => c.status === "paid");
  const activeReferrals = referrals.filter((referral: any) => {
    if (!referral.first_paid_at) return false;
    const client = clientMap.get(referral.client_id);
    return !!client && ["active", "expiring"].includes(String(client.status || "").toLowerCase());
  });

  return {
    partner: {
      id: partner.id,
      full_name: partner.full_name,
      email: partner.email,
      referral_code: partner.referral_code,
      referral_url: shareUrl(partner.referral_code),
      pix_key_type: partner.pix_key_type || "",
      pix_key: partner.pix_key || "",
      pix_holder_name: partner.pix_holder_name || "",
    },
    settings: {
      commission_subscription: Number(settings.commission_subscription || 10),
      commission_renewal: Number(settings.commission_renewal || 5),
    },
    dates,
    summary: {
      available_amount: initialPending + renewalNext,
      initial_pending_amount: initialPending,
      renewal_due_amount: renewalDue,
      next_close_amount: renewalNext,
      waiting_renewal_count: activeReferrals.length,
      waiting_renewal_amount: activeReferrals.length * Number(settings.commission_renewal || 5),
      received_amount: received,
    },
    clients: referrals.map((referral: any) => {
      const client = clientMap.get(referral.client_id);
      return {
        id: referral.id,
        name: client?.name || referral.client_name_snapshot || "Cliente",
        status: client?.status || "Cadastro não disponível",
        due_date: client?.due_date || null,
        referred_at: referral.referred_at,
        first_paid_at: referral.first_paid_at,
      };
    }),
    commissions: commissions.map((commission: any) => {
      const referral = referralMap.get(commission.referral_id);
      return {
        id: commission.id,
        client_name: referral?.client_name_snapshot || "Cliente",
        type: commission.commission_type,
        amount: commission.amount,
        status: commission.status,
        earned_at: commission.earned_at,
        eligible_at: commission.eligible_at,
        paid_at: commission.paid_at,
      };
    }),
  };
}

function generateReferralCode() {
  return "CP" + crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const user = await getUser(req);
  if (!user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "partner_dashboard");

  if (action === "partner_dashboard" || action === "save_pix") {
    const { data: partner, error } = await admin
      .from("cineplay_partners")
      .select("id,organization_id,user_id,full_name,email,referral_code,status,pix_key_type,pix_key,pix_holder_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !partner) return json({ error: "Esta conta não possui acesso ao painel de parceiros." }, 403);
    if (partner.status !== "active") return json({ error: "Seu acesso está suspenso. Entre em contato com o suporte." }, 403);

    if (action === "save_pix") {
      const type = String(body.pix_key_type || "");
      const key = String(body.pix_key || "").trim();
      const holder = String(body.pix_holder_name || "").trim();
      if (!allowedPixTypes.includes(type) || !key || !holder) {
        return json({ error: "Informe o tipo da chave, a chave Pix e o nome do titular." }, 400);
      }
      if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
        return json({ error: "O e-mail da chave Pix não parece válido." }, 400);
      }
      if ((type === "cpf" && key.replace(/\D/g, "").length !== 11) ||
          (type === "cnpj" && key.replace(/\D/g, "").length !== 14) ||
          (type === "phone" && (key.replace(/\D/g, "").length < 10 || key.replace(/\D/g, "").length > 13))) {
        return json({ error: "Confira o formato da chave Pix informada." }, 400);
      }
      const { error: updateError } = await admin
        .from("cineplay_partners")
        .update({
          pix_key_type: type,
          pix_key: key,
          pix_holder_name: holder,
          updated_at: new Date().toISOString(),
        })
        .eq("id", partner.id);
      if (updateError) return json({ error: updateError.message }, 400);
      return json({ ok: true, message: "Chave Pix atualizada." });
    }

    const settings = await ensureSettings(partner.organization_id);
    return json(await loadPartnerDashboard(partner, settings));
  }

  const manager = await getManagerContext(user.id);
  if (!manager) return json({ error: "Acesso restrito ao Master/Dono." }, 403);
  const organizationId = manager.organizationId;

  if (action === "admin_dashboard") {
    const settings = await ensureSettings(organizationId);
    return json(await loadAdminDashboard(organizationId, settings));
  }

  if (action === "create_partner") {
    const fullName = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!fullName || !email.includes("@") || password.length < 8) {
      return json({ error: "Informe nome, e-mail válido e senha com pelo menos 8 caracteres." }, 400);
    }

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, account_type: "cineplay_partner" },
    });
    if (created.error || !created.data.user) {
      return json({ error: created.error?.message || "Não foi possível criar a conta." }, 400);
    }

    const userId = created.data.user.id;
    const profileCheck = await admin.from("profiles").select("role,organization_id").eq("id", userId).maybeSingle();
    if (profileCheck.error || !profileCheck.data || profileCheck.data.role !== "staff" || profileCheck.data.organization_id) {
      await admin.auth.admin.deleteUser(userId);
      return json({ error: "A conta não recebeu o perfil restrito de parceiro. Nenhum acesso foi criado." }, 500);
    }
    const referralCode = generateReferralCode();
    const inserted = await admin
      .from("cineplay_partners")
      .insert({
        organization_id: organizationId,
        user_id: userId,
        full_name: fullName,
        email,
        referral_code: referralCode,
        status: "active",
      })
      .select("id,full_name,email,referral_code,status")
      .single();

    if (inserted.error || !inserted.data) {
      await admin.auth.admin.deleteUser(userId);
      return json({ error: inserted.error?.message || "Não foi possível cadastrar o parceiro." }, 500);
    }

    await ensureSettings(organizationId);
    return json({
      ok: true,
      partner: inserted.data,
      partner_portal_url: partnerPortalUrl,
      referral_url: shareUrl(referralCode),
    }, 201);
  }

  if (action === "update_partner") {
    const partnerId = String(body.partner_id || "");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.full_name !== undefined) {
      const name = String(body.full_name || "").trim();
      if (!name) return json({ error: "Informe o nome do parceiro." }, 400);
      patch.full_name = name;
    }
    if (body.status !== undefined) {
      const status = String(body.status);
      if (!["active", "suspended"].includes(status)) return json({ error: "Status inválido." }, 400);
      patch.status = status;
    }
    const { error } = await admin
      .from("cineplay_partners")
      .update(patch)
      .eq("id", partnerId)
      .eq("organization_id", organizationId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "assign_referral") {
    const partnerId = String(body.partner_id || "");
    const clientId = String(body.client_id || "");
    if (!partnerId || !clientId) return json({ error: "Selecione o parceiro e o cliente." }, 400);

    const [partnerQ, clientQ, existingQ] = await Promise.all([
      admin.from("cineplay_partners").select("id,status").eq("id", partnerId).eq("organization_id", organizationId).maybeSingle(),
      admin.from("clients").select("id,name,organization_id").eq("id", clientId).eq("organization_id", organizationId).maybeSingle(),
      admin.from("cineplay_partner_referrals").select("id,partner_id").eq("organization_id", organizationId).eq("client_id", clientId).maybeSingle(),
    ]);
    if (partnerQ.error || !partnerQ.data || partnerQ.data.status !== "active") {
      return json({ error: "Parceiro não encontrado ou inativo." }, 404);
    }
    if (clientQ.error || !clientQ.data) return json({ error: "Cliente não encontrado nesta organização." }, 404);
    if (existingQ.data) {
      return json({ error: existingQ.data.partner_id === partnerId ? "Este cliente já está vinculado a este parceiro." : "Este cliente já está vinculado a outro parceiro." }, 409);
    }

    const inserted = await admin.from("cineplay_partner_referrals").insert({
      organization_id: organizationId,
      partner_id: partnerId,
      client_id: clientId,
      client_name_snapshot: clientQ.data.name || "Cliente",
      created_by: user.id,
    }).select("id").single();
    if (inserted.error || !inserted.data) return json({ error: inserted.error?.message || "Não foi possível vincular a indicação." }, 400);

    // Reprocessa pagamentos já confirmados em ordem cronológica para que a primeira
    // assinatura e as renovações antigas sejam classificadas sem perder histórico.
    const paymentsQ = await admin
      .from("payments")
      .select("id,payment_status,paid_at,created_at")
      .eq("organization_id", organizationId)
      .eq("client_id", clientId);
    if (paymentsQ.error) return json({ ok: true, warning: "Indicação vinculada, mas não foi possível sincronizar o histórico de pagamentos: " + paymentsQ.error.message });

    const payments = (paymentsQ.data || [])
      .filter((payment: any) => paidStatuses.includes(String(payment.payment_status || "").toLowerCase()))
      .sort((a: any, b: any) => {
        const ta = new Date(a.paid_at || a.created_at).getTime();
        const tb = new Date(b.paid_at || b.created_at).getTime();
        return ta - tb || String(a.id).localeCompare(String(b.id));
      });

    for (const payment of payments) {
      const replay = await admin.from("payments")
        .update({ payment_status: payment.payment_status })
        .eq("id", payment.id)
        .eq("organization_id", organizationId);
      if (replay.error) {
        return json({ ok: true, warning: "Indicação vinculada; parte do histórico foi sincronizada. Atualize a indicação para revisar: " + replay.error.message });
      }
    }

    const { data: generated } = await admin
      .from("cineplay_partner_commissions")
      .select("id,commission_type,amount")
      .eq("referral_id", inserted.data.id);
    return json({ ok: true, generated_commissions: generated || [] }, 201);
  }

  if (action === "mark_subscription_paid") {
    const commissionId = String(body.commission_id || "");
    if (!commissionId) return json({ error: "Comissão não informada." }, 400);
    const scopeCheck = await admin.from("cineplay_partner_commissions").select("id")
      .eq("id", commissionId).eq("organization_id", organizationId).maybeSingle();
    if (scopeCheck.error || !scopeCheck.data) return json({ error: "Comissão não encontrada nesta organização." }, 404);
    const { data, error } = await admin.rpc("cineplay_partner_mark_subscription_paid", {
      p_commission_id: commissionId,
      p_actor_id: user.id,
    });
    if (error) return json({ error: error.message }, 400);
    if (data?.error) return json({ error: data.error }, 400);
    return json(data || { ok: true });
  }

  if (action === "pay_monthly_renewals") {
    const partnerId = String(body.partner_id || "");
    if (!partnerId) return json({ error: "Parceiro não informado." }, 400);
    const scopeCheck = await admin.from("cineplay_partners").select("id")
      .eq("id", partnerId).eq("organization_id", organizationId).maybeSingle();
    if (scopeCheck.error || !scopeCheck.data) return json({ error: "Parceiro não encontrado nesta organização." }, 404);
    const settings = await ensureSettings(organizationId);
    const dates = closeDates(Number(settings.monthly_close_day || 10), settings.timezone || "America/Maceio");
    const { data, error } = await admin.rpc("cineplay_partner_pay_monthly_renewals", {
      p_partner_id: partnerId,
      p_close_date: dates.currentClose,
      p_actor_id: user.id,
    });
    if (error) return json({ error: error.message }, 400);
    if (data?.error) return json({ error: data.error }, 400);
    return json({ ...data, close_date: dates.currentClose });
  }

  if (action === "save_settings") {
    const subscription = Number(body.commission_subscription);
    const renewal = Number(body.commission_renewal);
    const closeDay = Number(body.monthly_close_day);
    if (!Number.isFinite(subscription) || subscription < 0 ||
        !Number.isFinite(renewal) || renewal < 0 ||
        !Number.isInteger(closeDay) || closeDay < 1 || closeDay > 31) {
      return json({ error: "Confira os valores das comissões e o dia de fechamento (1 a 31)." }, 400);
    }
    const { error } = await admin.from("cineplay_partner_settings").upsert({
      organization_id: organizationId,
      commission_subscription: subscription,
      commission_renewal: renewal,
      monthly_close_day: closeDay,
      timezone: "America/Maceio",
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }, { onConflict: "organization_id" });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Ação não reconhecida." }, 400);
}

Deno.serve(async (req: Request) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error("cineplay-partners:", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
});