(()=>{
  const S='https://jbdjfmvdrwdfnuhqrprc.supabase.co';
  const K='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiZGpmbXZkcndkZm51aHFycHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MTE3MzEsImV4cCI6MjEwMzA4NzczMX0.yofxMaRrQJkP7g9E8ML5vVbHPL51hrnbiTb42g396F8';
  const adminRoles=['master','owner','admin','dono'];
  const moneyInt=v=>Number(v||0).toLocaleString('pt-BR');
  const pct=(a,b)=>b?((a/b)*100).toFixed(1)+'%':'0%';
  const dayLabel=d=>{const p=String(d||'').split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(d||'—')};
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  function ensureCard(){
    let card=document.getElementById('cineplayStats');
    if(card)return card;
    card=document.createElement('div');card.id='cineplayStats';card.className='card';
    card.innerHTML='<h3>📊 Estatísticas do site Cineplay</h3><div id="cineplayStatsBody" class="status">Carregando...</div>';
    const form=document.getElementById('form');form?.parentNode?.insertBefore(card,form);return card;
  }
  function findStoredSession(){
    try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)||'';if(!key.startsWith('sb-')||!key.endsWith('-auth-token'))continue;const raw=localStorage.getItem(key);if(!raw)continue;const parsed=JSON.parse(raw);const session=parsed?.currentSession||parsed;if(session?.access_token&&session?.user)return session;}}catch(e){console.warn('[Cineplay Stats] sessão local não pôde ser lida',e)}
    return null;
  }
  async function getAccessToken(){
    const stored=findStoredSession();
    if(stored?.access_token)return stored.access_token;
    if(window.supabase?.createClient){const sb=window.supabase.createClient(S,K,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const r=await sb.auth.getSession();return r?.data?.session?.access_token||null;}
    return null;
  }
  async function api(path,token){
    const headers={apikey:K,Authorization:'Bearer '+(token||K)};
    const r=await fetch(S+'/rest/v1/'+path,{headers,cache:'no-store'});const text=await r.text();
    if(!r.ok)throw new Error('HTTP '+r.status+(text?' — '+text:''));
    try{return JSON.parse(text)}catch{return text}
  }
  async function load(){
    const card=ensureCard();const body=card.querySelector('#cineplayStatsBody')||document.getElementById('cineplayStatsBody');
    try{
      body.textContent='Verificando acesso...';const token=await getAccessToken();
      if(!token){body.textContent='Sessão do GestorPro não encontrada. Entre novamente no GestorPro e abra esta página.';return;}
      const profiles=await api('profiles?select=role&limit=1',token);const role=String(profiles?.[0]?.role||'').toLowerCase();
      if(!adminRoles.includes(role)){body.textContent='Estatísticas disponíveis somente para Master/Dono.';return;}
      body.textContent='Buscando dados do site...';
      const rows=await api('cineplay_site_daily_stats?select=day,visits,clicks_total,clicks_trial&order=day.desc&limit=30',token);const data=Array.isArray(rows)?rows:[];
      const totals=data.reduce((a,r)=>({visits:a.visits+Number(r.visits||0),clicks:a.clicks+Number(r.clicks_total||0),trial:a.trial+Number(r.clicks_trial||0)}),{visits:0,clicks:0,trial:0});
      const cards=[['👀 Visitas',moneyInt(totals.visits)],['🖱️ Cliques totais',moneyInt(totals.clicks)],['🎁 Cliques em Teste Grátis',moneyInt(totals.trial)],['📈 Conversão do Teste',pct(totals.trial,totals.visits)];
      body.innerHTML='<div class="preview-grid">'+cards.map(x=>'<div class="preview-item"><span>'+x[0]+'</span><strong>'+esc(x[1])+'</strong></div>').join('')+'</div><div class="hint">Histórico dos últimos 30 dias. Não são armazenados nome, telefone, e-mail ou outros dados pessoais.</div>'+
      (data.length?'<div style="overflow:auto;margin-top:14px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left;padding:9px;border-bottom:1px solid #302642">Dia</th><th style="padding:9px;border-bottom:1px solid #302642">Visitas</th><th style="padding:9px;border-bottom:1px solid #302642">Cliques</th><th style="padding:9px;border-bottom:1px solid #302642">Teste Grátis</th><th style="padding:9px;border-bottom:1px solid #302642">Conversão</th></tr></thead><tbody>'+data.map(r=>'<tr><td style="padding:9px;border-bottom:1px solid #241d32">'+dayLabel(r.day)+'</td><td style="text-align:center;padding:9px;border-bottom:1px solid #241d32">'+moneyInt(r.visits)+'</td><td style="text-align:center;padding:9px;border-bottom:1px solid #241d32">'+moneyInt(r.clicks_total)+'</td><td style="text-align:center;padding:9px;border-bottom:1px solid #241d32">'+moneyInt(r.clicks_trial)+'</td><td style="text-align:center;padding:9px;border-bottom:1px solid #241d32">'+pct(Number(r.clicks_trial||0),Number(r.visits||0))+'</td></tr>').join('')}</tbody></table></div>':'<div class="status">Ainda não há acessos registrados.</div>');
    }catch(e){body.textContent='Não foi possível carregar as estatísticas: '+(e?.message||e);console.error('[Cineplay Stats]',e)}
  }
  function init(){load()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();