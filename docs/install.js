/* GestorPro — instalação simplificada (PWA + APK quando disponível). */
(() => {
  const APK_URL = './GestorPro.apk';
  let deferredPrompt = null;
  let banner = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function createBanner() {
    if (banner || isStandalone()) return;
    banner = document.createElement('div');
    banner.id = 'gpInstallBanner';
    banner.innerHTML = `
      <div style="position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;max-width:520px;margin:auto;padding:14px 16px;background:#171326;color:#fff;border:1px solid #4c3a78;border-radius:16px;box-shadow:0 12px 35px rgba(0,0,0,.45);font-family:system-ui,sans-serif">
        <div style="font-weight:800;font-size:16px">📲 Instale o GestorPro</div>
        <div style="font-size:13px;color:#cfc7df;margin-top:5px">Tenha acesso rápido pela tela inicial do celular.</div>
        <div id="gpInstallActions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:11px"></div>
        <button id="gpInstallClose" type="button" style="margin-top:9px;border:0;background:transparent;color:#a78bfa;font-size:12px;cursor:pointer">Agora não</button>
      </div>`;
    document.body.appendChild(banner);
    banner.querySelector('#gpInstallClose').onclick = () => banner.remove();
    renderActions();
  }

  function renderActions() {
    if (!banner) return;
    const actions = banner.querySelector('#gpInstallActions');
    actions.innerHTML = '';
    if (deferredPrompt) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Instalar GestorPro';
      b.style.cssText = 'border:0;border-radius:10px;padding:11px 14px;background:#8b5cf6;color:#fff;font-weight:800;cursor:pointer';
      b.onclick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (_) {}
        deferredPrompt = null;
        if (banner) banner.remove();
      };
      actions.appendChild(b);
    } else {
      const hint = document.createElement('div');
      hint.textContent = 'No Chrome: toque no menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”.';
      hint.style.cssText = 'font-size:12px;color:#ddd;padding:8px 0;line-height:1.4';
      actions.appendChild(hint);
    }

    fetch(APK_URL, { method: 'HEAD', cache: 'no-store' })
      .then(r => {
        if (!r.ok) return;
        const a = document.createElement('a');
        a.href = APK_URL;
        a.download = '';
        a.textContent = 'Baixar APK';
        a.style.cssText = 'display:inline-block;text-decoration:none;border-radius:10px;padding:11px 14px;background:#27203c;color:#fff;font-weight:800;border:1px solid #5b4687';
        actions.appendChild(a);
      }).catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    createBanner();
    renderActions();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (banner) banner.remove();
  });

  window.addEventListener('load', () => {
    if (!isStandalone()) setTimeout(createBanner, 900);
  });
})();
