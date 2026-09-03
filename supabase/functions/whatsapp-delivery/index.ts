import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-gestorpro-cron',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const rawSecretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
const secretKey = rawSecretKeys ? JSON.parse(rawSecretKeys).default : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, secretKey);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

async function sendText(phoneNumberId: string, accessToken: string, to: string, message: string) {
  const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\D/g, ''),
      type: 'text',
      text: { preview_url: false, body: message },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `WhatsApp API HTTP ${response.status}`);
  return data;
}

async function authenticateUser(req: Request) {
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const { data } = await admin.auth.getUser(header.slice(7));
  return data.user ?? null;
}

async function testMessage(req: Request, body: any) {
  const user = await authenticateUser(req);
  if (!user) return json({ error: 'Sessão inválida' }, 401);

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile?.organization_id) return json({ error: 'Organização não encontrada' }, 403);

  const to = String(body?.to || '').trim();
  const message = String(body?.message || '').trim();
  if (!to || !message) return json({ error: 'Informe o número e a mensagem.' }, 400);

  const { data: configs, error: configError } = await admin.rpc('get_whatsapp_delivery_config', {
    p_organization_id: profile.organization_id,
  });
  const config = Array.isArray(configs) ? configs[0] : configs;
  if (configError || !config?.phone_number_id || !config?.access_token) {
    return json({ error: 'Configure o Phone Number ID e o Access Token antes do teste.' }, 400);
  }

  try {
    await sendText(config.phone_number_id, config.access_token, to, message);
    return json({ ok: true, message: 'Mensagem de teste enviada.' });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao enviar.' }, 400);
  }
}

async function processMessages(req: Request) {
  const supplied = req.headers.get('x-gestorpro-cron') || '';
  const { data: expected, error: tokenError } = await admin.rpc('get_whatsapp_job_token');
  if (tokenError || !expected || supplied !== expected) return json({ error: 'Não autorizado' }, 401);

  const today = new Date().toISOString().slice(0, 10);
  const { data: queued, error: queueError } = await admin.rpc('queue_whatsapp_expiry_messages', { p_run_date: today });
  if (queueError) return json({ error: queueError.message }, 500);

  const { data: pending, error: pendingError } = await admin
    .from('whatsapp_message_logs')
    .select('id,organization_id,phone,message')
    .eq('status', 'pending')
    .eq('scheduled_for', today)
    .order('created_at', { ascending: true })
    .limit(500);
  if (pendingError) return json({ error: pendingError.message }, 500);

  const sentToday = new Map<string, number>();
  const { data: sentRows } = await admin
    .from('whatsapp_message_logs')
    .select('organization_id')
    .eq('status', 'sent')
    .gte('sent_at', `${today}T00:00:00.000Z`)
    .lt('sent_at', `${today}T23:59:59.999Z`)
    .limit(5000);
  for (const row of sentRows || []) sentToday.set(row.organization_id, (sentToday.get(row.organization_id) || 0) + 1);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of pending || []) {
    const { data: configs } = await admin.rpc('get_whatsapp_delivery_config', {
      p_organization_id: row.organization_id,
    });
    const config = Array.isArray(configs) ? configs[0] : configs;
    if (!config?.enabled || !config?.phone_number_id || !config?.access_token) {
      skipped++;
      continue;
    }

    const current = sentToday.get(row.organization_id) || 0;
    const limit = Number(config.daily_limit || 0);
    if (limit > 0 && current >= limit) {
      skipped++;
      continue;
    }

    try {
      await sendText(config.phone_number_id, config.access_token, row.phone, row.message);
      await admin.from('whatsapp_message_logs').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: null,
      }).eq('id', row.id);
      sentToday.set(row.organization_id, current + 1);
      sent++;
    } catch (error) {
      await admin.from('whatsapp_message_logs').update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Falha desconhecida',
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      failed++;
    }
  }

  return json({ ok: true, queued: Number(queued || 0), sent, failed, skipped });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const body = await req.json().catch(() => ({}));
  if (body?.action === 'test') return testMessage(req, body);
  if (body?.action === 'process') return processMessages(req);
  return json({ error: 'Ação inválida' }, 400);
});
