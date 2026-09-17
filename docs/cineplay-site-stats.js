(()=>{
  const S='https://jbdjfmvdrwdfnuhqrprc.supabase.co';
  const K='sb_publishable_3ABEFAwN_wzmSu13EyVOQ_h5Xfmz80';
  const adminRoles=['master','owner','admin','dono'];
  let sb=null;

  async function getClient(){
    if(sb)return sb;
    if(window.supabase?.createClient){
      sb=window.supabase.createClient(S,K,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      return sb;
    }
    const m=await import('https://esm.sh/@supabase/supabase-js@2');
    sb=m.createClient(S,K,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    return sb;
  }

  const moneyInt=v=>Number(v||0).toLocaleString('pt-BR');
  const pct=(a,b)=>b?((a/b)*100).toFixed(1)+'%':'0%';
  const dayLabel=d=>{const p=String(d||'').split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(d||'—')};
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  function ensureCard(){
    let card=document.getElementById('cineplayStats');
    if(card)return card;
    card=document.createElement('div');
    card.id='cineplayStats';
    card.className='card';
    card.innerHTML='<h3>📊 Estatísticas do site Cineplay</h3><div id="cineplayStatsBody" class="status">Carregando...</div>';
    const form=document.getElementById('form');
    form?.parentNode?.insertBefore(card,form);
    return card;
  }

  async function waitForSession(s){
    for(let i=0;i<4;i++){
      const r=await s.auth.getSession();
      if(r?.data?.session?.user)return r.data.session.user;
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    const r=await s.auth.getUser();
    return r?.data?.user||null;
  }

  async function load(){
    const card=ensureCard();
    const body=card.querySelector('#cineplayStatsBody')||document.getElementById('cineplayStatsBody');
    try{
      body.textContent='Verificando acesso...';
      const s=await getClient();
      const user=await waitForSession(s);
      if(!user){
        body.textContent='Sessão do GestorPro ainda não foi carregada. Recarregue esta página.';
        return;
      }

      const {data:p,error:pe}=await s.from('profiles').select('role').eq('id',user.id).maybeSingle();
      if(pe)throw new Error('Erro ao verificar perfil: '+pe.message);
      const role=String(p?.role||'').toLowerCase();
      if(!adminRoles.includes(role)){
        body.textContent='Estatísticas disponíveis somente para Master/Dono.';
        return;
      }

      body.textContent='Buscando dados do site...';
      const {data,error}=await s.from('cineplay_site_daily_stats').select('day,visits,clicks_total,clicks_trial').order('day',{ascending:false}).limit(30);
      if(error)throw new Error('Erro ao consultar estatísticas: '+error.message);

      const rows=data||[];
      const totals=rows.reduce((a,r)=>({
        visits:a.visits+Number(r.visits||0),
        clicks:a.clicks+Number(r.clicks_total||0),
        trial:a.trial+Number(r.clicks_trial||0)
      }),{visits:0,clicks:0,trial:0});

      const cards=[
        ['👀 Visitas',moneyInt(totals.visits)],
        ['🖱️ Cliques totais',moneyInt(totals.clicks)],
        ['🎁 Cliques em Teste Grátis',moneyInt(totals.trial)],
        ['📈 Conversão do Teste',pct(totals.trial,totals.visits)]
      ];

      body.innerHTML='<div class="preview-grid">'+cards.map(x=>'<div class="preview-item"><span>'+x[0]+'</span><strong>'+esc(x[1])+'</strong></div>').join('')+'</div><div class="hint">Histórico dos últimos 30 dias. Não são armazenados nome, telefone, e-mail ou outros dados pessoais.</div>'+
      (rows.length?'<div style="overflow:auto;margin-top:14px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left;padding:9px;border-bottom:1px solid #302642">Dia</th><th style="padding:9px;border-bottom:1px solid #302642">Visitas</th><th style="padding:9px;border-bottom:1px solid #302642">Cliques</th><th style="padding:9px;border-bottom:1px solid #302642">Teste Grátis</th><th style="padding:9px;border-bottom:1px solid #302642">Conversão</th></tr></thead><tbody>'+rows.map(r=>'<tr><td style="padding:9px;border-bottom:1px solid #241d32">'+dayLabel(r.day)+'</td><td style="text-align:center;padding:9px;border-bottom:1px solid #241d32">'+moneyInt(r.visits)+'</td><td style="text-align:center;padding:9px;border-bottom:1px solid #241d32">'+moneyInt(r.clicks_total)+'</td><td style="text-align:center;padding:9px;border-bottom:1px solid #241d32">'+moneyInt(r.clicks_trial)+'</td><td style="text-align:center;padding:9px;border-bottom:1px solid #241d32">'+pct(Number(r.clicks_trial||0),Number(r.visits||0))+'</td></tr>').join('')+'</tbody></table></div>':'<div class="status">Ainda não há acessos registrados.</div>');
    }catch(e){
      body.textContent='Não foi possível carregar as estatísticas: '+(e?.message||e);
      console.error('[Cineplay Stats]',e);
    }
  }

  function init(){load();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();