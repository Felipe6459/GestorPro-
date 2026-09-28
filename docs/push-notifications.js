const SUPABASE_URL = 'https://jbdjfmvdrwdfnuhqrprc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80';
const VAPID_PUBLIC_KEY = 'BM1XnRQ3iaKGzm2ntDX0RA02K2peujTMetLZdBRVFIcHy_tFioDPP0DIJt3sDJSL65QqvtO319TUKJYEVp1vQ2s';
const sb = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

async function bootPushNotifications() {
  if (document.getElementById('gpNotificationsTab')) return;
  const mod = await import('https://esm.sh/@supabase/supabase-js@2');
  const client = mod.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const { data: sessionData } = await client.auth.getSession();
  const session = sessionData.session;
  if (!session) return;

  const { data: profile } = await client.from('profiles').select('organization_id').eq('id', session.user.id).maybeSingle();
  const org = profile?.organization_id || '';

  const tabs = document.querySelector('.tabs');
  if (!tabs || document.getElementById('gpNotificationsTab')) return;

  const tab = document.createElement('button');
  tab.id = 'gpNotificationsTab';
  tab.type = 'button';
  tab.textContent = '🔔 Notificações';
  tabs.appendChild(tab);

  const section = document.createElement('section');
  section.id = 'gpNotificationsView';
  section.className = 'view';
  section.innerHTML = `
    <div class="panel gp-notify-panel">
      <div class="gp-notify-head">
        <div>
          <h3 style="margin:0 0 5px">🔔 Notificações de cobrança</h3>
          <div class="muted">Receba no celular um aviso diário para lembrar das cobranças. Não envia mensagens aos clientes.</div>
        </div>
        <span id="gpNotifyStatus" class="gp-notify-badge">DESATIVADO</span>
      </div>
      <div class="grid" style="margin-top:16px">
        <div class="field">
          <label>Horário do aviso</label>
          <input id="gpNotifyTime" type="time" value="08:00">
        </div>
        <div class="field">
          <label>Fuso horário</label>
          <select id="gpNotifyTimezone">
            <option value="America/Maceio">Brasil — Alagoas</option>
            <option value="America/Sao_Paulo">Brasil — São Paulo</option>
            <option value="America/Fortaleza">Brasil — Fortaleza</option>
            <option value="America/Recife">Brasil — Recife</option>
            <option value="America/Bahia">Brasil — Bahia</option>
          </select>
        </div>
      </div>
      <div class="gp-notify-checks">
        <label><input id="gpNotifyToday" type="checkbox" checked> Clientes que vencem hoje</label>
        <label><input id="gpNotifyOverdue" type="checkbox"> Clientes atrasados</label>
        <label><input id="gpNotifyTomorrow" type="checkbox"> Clientes que vencem amanhã</label>
      </div>
      <div class="row">
        <button id="gpNotifyEnable">🔔 Ativar notificações</button>
        <button id="gpNotifyTest" class="secondary">Enviar teste</button>
        <button id="gpNotifySave" class="secondary">Salvar horário</button>
      </div>
      <div id="gpNotifyMsg" class="muted" style="margin-top:12px"></div>
    </div>
  `;
  document.querySelector('.wrap')?.appendChild(section);

  const style = document.createElement('style');
  style.textContent = `
    #gpNotificationsView .gp-notify-panel{background:linear-gradient(145deg,#17131f,#111016)!important}
    #gpNotificationsView .gp-notify-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
    #gpNotificationsView .gp-notify-badge{font-size:10px;font-weight:800;letter-spacing:.08em;padding:6px 9px;border-radius:999px;background:#3f3f46;color:#d4d4d8;white-space:nowrap}
    #gpNotificationsView .gp-notify-badge.on{background:#166534;color:#dcfce7}
    #gpNotificationsView .gp-notify-checks{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}
    #gpNotificationsView .gp-notify-checks label{display:flex;align-items:center;gap:7px;color:#ddd}
    #gpNotificationsView .gp-notify-checks input{accent-color:#8b5cf6}
  `;
  document.head.appendChild(style);

  const $ = id => document.getElementById(id);
  const msg = (text, ok=false) => { $('gpNotifyMsg').textContent = text; $('gpNotifyMsg').className = ok ? 'ok' : 'muted'; };
  const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

  async function loadSettings() {
    const { data } = await client.from('gestorpro_notification_settings')
      .select('*').eq('user_id', session.user.id).maybeSingle();
    if (data) {
      $('gpNotifyTime').value = String(data.notify_time || '08:00').slice(0,5);
      $('gpNotifyTimezone').value = data.timezone || 'America/Maceio';
      $('gpNotifyToday').checked = data.notify_today !== false;
      $('gpNotifyOverdue').checked = data.notify_overdue === true;
      $('gpNotifyTomorrow').checked = data.notify_tomorrow === true;
      setStatus(data.enabled);
    }
  }

  function setStatus(on) {
    const badge = $('gpNotifyStatus');
    badge.textContent = on ? 'ATIVADO' : 'DESATIVADO';
    badge.classList.toggle('on', !!on);
  }

  async function saveSettings(enabled) {
    const payload = {
      user_id: session.user.id,
      organization_id: org,
      enabled: enabled,
      notify_today: $('gpNotifyToday').checked,
      notify_overdue: $('gpNotifyOverdue').checked,
      notify_tomorrow: $('gpNotifyTomorrow').checked,
      notify_time: $('gpNotifyTime').value || '08:00',
      timezone: $('gpNotifyTimezone').value || 'America/Maceio',
      updated_at: new Date().toISOString()
    };
    const { error } = await client.from('gestorpro_notification_settings').upsert(payload, { onConflict: 'user_id' });
    if (error) throw error;
    setStatus(enabled);
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  async function ensureSubscription() {
    if (!supported) throw new Error('Este navegador não oferece notificações Push para o GestorPro.');
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('A permissão de notificações não foi concedida.');
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {\n      await subscription.unsubscribe().catch(() => {});\n      subscription = null;\n    }\n    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    const json = subscription.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) throw new Error('Não foi possível registrar o dispositivo.');
    const { error } = await client.from('gestorpro_push_subscriptions').upsert({
      user_id: session.user.id,
      organization_id: org,
      endpoint,
      p256dh,
      auth,
      enabled: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });
    if (error) throw error;
  }

  tab.onclick = () => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    section.classList.add('active');
  };

  $('gpNotifyEnable').onclick = async () => {
    try {
      $('gpNotifyEnable').disabled = true;
      await ensureSubscription();
      await saveSettings(true);
      msg('Notificações ativadas. Agora você receberá o aviso no horário escolhido.', true);
    } catch (e) {
      msg(e?.message || String(e));
    } finally {
      $('gpNotifyEnable').disabled = false;
    }
  };

  $('gpNotifySave').onclick = async () => {
    try {
      await saveSettings(true);
      msg('Configuração salva. As notificações continuam ativas.', true);
    } catch (e) { msg(e?.message || String(e)); }
  };

  $('gpNotifyTest').onclick = async () => {
    try {
      $('gpNotifyTest').disabled = true;
      await ensureSubscription();
      const { data, error } = await client.functions.invoke('gestorpro-push', {
        body: { action: 'test' }
      });
      if (error) throw error;
      if (!data?.sent) throw new Error('O teste foi enviado, mas nenhum dispositivo ativo foi encontrado.');
      msg('Teste enviado. Confira agora a área de notificações do celular.', true);
    } catch (e) { msg(e?.message || String(e)); }
    finally { $('gpNotifyTest').disabled = false; }
  };

  await loadSettings();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bootPushNotifications().catch(console.error));
else bootPushNotifications().catch(console.error);
