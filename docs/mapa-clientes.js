import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

(() => {
  const ROOT = 'gpClientMap';
  const STYLE = 'gpClientMapStyle';
  const SUPABASE_URL = 'https://jbdjfmvdrwdfnuhqrprc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80';
  const GEOJSON_URL = 'https://cdn.jsdelivr.net/gh/henriquemalvar/br-geojson@main/dist/estados.geojson';
  const STATES = [
    ['AC','Acre','Norte'],['AL','Alagoas','Nordeste'],['AP','Amapá','Norte'],['AM','Amazonas','Norte'],
    ['BA','Bahia','Nordeste'],['CE','Ceará','Nordeste'],['DF','Distrito Federal','Centro-Oeste'],
    ['ES','Espírito Santo','Sudeste'],['GO','Goiás','Centro-Oeste'],['MA','Maranhão','Nordeste'],
    ['MT','Mato Grosso','Centro-Oeste'],['MS','Mato Grosso do Sul','Centro-Oeste'],['MG','Minas Gerais','Sudeste'],
    ['PA','Pará','Norte'],['PB','Paraíba','Nordeste'],['PR','Paraná','Sul'],['PE','Pernambuco','Nordeste'],
    ['PI','Piauí','Nordeste'],['RJ','Rio de Janeiro','Sudeste'],['RN','Rio Grande do Norte','Nordeste'],
    ['RS','Rio Grande do Sul','Sul'],['RO','Rondônia','Norte'],['RR','Roraima','Norte'],['SC','Santa Catarina','Sul'],
    ['SP','São Paulo','Sudeste'],['SE','Sergipe','Nordeste'],['TO','Tocantins','Norte']
  ];
  const COLORS = ['#8b5cf6','#06b6d4','#f59e0b','#ec4899','#22c55e','#3b82f6','#a3e635',
    '#f97316','#14b8a6','#e879f9','#eab308','#64748b','#6366f1','#10b981','#fb7185',
    '#0ea5e9','#a855f7','#84cc16','#d946ef','#38bdf8','#f43f5e','#2dd4bf','#c084fc',
    '#facc15','#818cf8','#34d399','#fb923c'];
  const COLOR = Object.fromEntries(STATES.map((s,i)=>[s[0],COLORS[i]]));
  const DDD = {
    '11':'SP','12':'SP','13':'SP','14':'SP','15':'SP','16':'SP','17':'SP','18':'SP','19':'SP',
    '21':'RJ','22':'RJ','24':'RJ','27':'ES','28':'ES',
    '31':'MG','32':'MG','33':'MG','34':'MG','35':'MG','37':'MG','38':'MG',
    '41':'PR','42':'PR','43':'PR','44':'PR','45':'PR','46':'PR',
    '47':'SC','48':'SC','49':'SC','51':'RS','53':'RS','54':'RS','55':'RS',
    '61':null,'62':'GO','64':'GO','63':'TO','65':'MT','66':'MT','67':'MS','68':'AC','69':'RO',
    '71':'BA','73':'BA','74':'BA','75':'BA','77':'BA','79':'SE',
    '81':'PE','87':'PE','82':'AL','83':'PB','84':'RN','85':'CE','88':'CE','86':'PI','89':'PI',
    '91':'PA','93':'PA','94':'PA','92':'AM','97':'AM','95':'RR','96':'AP','98':'MA','99':'MA'
  };
  let sb, orgId = '', rows = [], selectedUF = '', geoFeatures = [], mapReady = false;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = uf => STATES.find(s => s[0] === uf);
  const getDDD = phone => {
    let n = String(phone || '').replace(/\D/g,'');
    if (n.startsWith('55') && n.length >= 12) n = n.slice(2);
    return n.length >= 10 ? n.slice(0,2) : '';
  };
  const inferredUF = phone => {
    const d = getDDD(phone);
    return Object.prototype.hasOwnProperty.call(DDD,d) ? DDD[d] : null;
  };
  const clientUF = c => c.uf || inferredUF(c.whatsapp);

  function addStyles() {
    if ($(STYLE)) return;
    const style = document.createElement('style');
    style.id = STYLE;
    style.textContent = `
      #gpClientMap{display:none;max-width:100%;color:#f5f3ff}
      #gpClientMap.active{display:block}
      #gpClientMap .gpcm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
      #gpClientMap .gpcm-muted{color:#aaa;font-size:13px}
      #gpClientMap .gpcm-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
      #gpClientMap .gpcm-card,#gpClientMap .gpcm-panel{background:#171326;border:1px solid #30264d;border-radius:12px;padding:14px;min-width:0}
      #gpClientMap .gpcm-number{font-size:25px;font-weight:800;margin-top:5px}
      #gpClientMap .gpcm-layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);gap:12px}
      #gpClientMap .gpcm-map{width:100%;height:auto;display:block;max-height:650px}
      #gpClientMap .gpcm-state{stroke:#0d0b15;stroke-width:2;stroke-linejoin:round;cursor:pointer;transition:opacity .15s}
      #gpClientMap .gpcm-state:hover{stroke:#fff;stroke-width:3;opacity:.9}
      #gpClientMap .gpcm-state.selected{stroke:#fff;stroke-width:4}
      #gpClientMap .gpcm-bar-row{display:grid;grid-template-columns:34px minmax(70px,1fr) 42px;gap:8px;align-items:center;margin:8px 0;font-size:12px}
      #gpClientMap .gpcm-bar{height:10px;border-radius:99px;background:#29233b;overflow:hidden}
      #gpClientMap .gpcm-bar>i{display:block;height:100%;border-radius:99px}
      #gpClientMap .gpcm-list{max-height:360px;overflow:auto}
      #gpClientMap .gpcm-client{display:grid;grid-template-columns:minmax(0,1fr) 86px;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid #30264d}
      #gpClientMap select,#gpClientMap input{width:100%;box-sizing:border-box;background:#0f0c18;color:#fff;border:1px solid #40365c;border-radius:7px;padding:8px}
      #gpClientMap button{border:0;border-radius:8px;padding:8px 11px;background:#8b5cf6;color:#fff;font-weight:700;cursor:pointer}
      #gpClientMap .gpcm-note{font-size:12px;color:#fbbf24;margin-top:8px}
      #gpClientMap .gpcm-empty{color:#aaa;padding:14px 0}
      #gpClientMap .gpcm-selected-info{margin:10px 0;padding:11px 12px;border:1px solid #59418a;border-radius:9px;background:#211936;color:#fff;font-weight:700;min-height:20px}
      #gpClientMap .gpcm-selected-info small{display:block;margin-top:3px;color:#c4b5fd;font-weight:400}
      @media(max-width:760px){#gpClientMap .gpcm-layout{grid-template-columns:1fr}#gpClientMap .gpcm-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:420px){#gpClientMap .gpcm-kpis{grid-template-columns:1fr 1fr}#gpClientMap .gpcm-card,#gpClientMap .gpcm-panel{padding:11px}}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    const tabs = document.querySelector('.tabs');
    if (!tabs || $('gpClientMapTab') || !document.querySelector('#clientForm')) return false;
    addStyles();
    const btn = document.createElement('button');
    btn.id = 'gpClientMapTab';
    btn.type = 'button';
    btn.textContent = '🗺️ Mapa de Clientes';
    btn.addEventListener('click', openView);
    tabs.appendChild(btn);
    const section = document.createElement('section');
    section.id = ROOT;
    section.className = 'view';
    section.innerHTML = `
      <div class="gpcm-head"><div><h2 style="margin:0 0 5px">Mapa de Clientes</h2><div class="gpcm-muted">Distribuição dos clientes pelos 26 estados e Distrito Federal</div></div><button id="gpcmRefresh" type="button">Atualizar mapa</button></div>
      <div class="gpcm-kpis">
        <div class="gpcm-card">Clientes no mapa<div class="gpcm-number" id="gpcmTotal">—</div></div>
        <div class="gpcm-card">Estados com clientes<div class="gpcm-number" id="gpcmStates">—</div></div>
        <div class="gpcm-card">Sem estado identificado<div class="gpcm-number" id="gpcmUnknown">—</div></div>
      </div>
      <div class="gpcm-layout">
        <div class="gpcm-panel"><h3 style="margin-top:0">Brasil por estado</h3><div id="gpcmMap" class="gpcm-empty">Carregando mapa geográfico…</div><div id="gpcmMapSelectedInfo" class="gpcm-selected-info" aria-live="polite">Toque em qualquer estado do mapa para ver o nome.</div><div class="gpcm-muted">Estados com clientes aparecem coloridos. Toque em um estado para ver o nome e filtrar a lista.</div></div>
        <div class="gpcm-panel"><h3 style="margin-top:0">Clientes por estado</h3><div id="gpcmChart"></div></div>
      </div>
      <div class="gpcm-panel" style="margin-top:12px">
        <div class="gpcm-head"><div><h3 style="margin:0 0 5px" id="gpcmDetailTitle">Clientes por estado</h3><div class="gpcm-muted" id="gpcmDetailSub">Selecione um estado no mapa ou no gráfico.</div></div><input id="gpcmSearch" style="max-width:240px" placeholder="Buscar cliente ou WhatsApp"></div>
        <div id="gpcmClients" class="gpcm-list"></div>
        <div class="gpcm-note">O DDD identifica a maioria dos estados. O DDD 61 pode abranger DF e municípios de Goiás; nesses casos, escolha a UF correta manualmente. A correção fica salva no cadastro do cliente.</div>
      </div>`;
    document.querySelector('.wrap').appendChild(section);
    $('gpcmRefresh').addEventListener('click', load);
    $('gpcmSearch').addEventListener('input', renderClients);
    return true;
  }

  function openView() {
    if (window.GestorProActivateView) window.GestorProActivateView(ROOT, $('gpClientMapTab'));
    else {
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
      $(ROOT).classList.add('active');
      document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active', b === $('gpClientMapTab')));
    }
    load();
  }

  async function load() {
    $('gpcmMap').textContent = 'Carregando dados…';
    try {
      if (!sb) sb = createClient(SUPABASE_URL, SUPABASE_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      const {data:{session},error:sessionError} = await sb.auth.getSession();
      if (sessionError || !session) throw new Error('Sua sessão expirou. Entre novamente no GestorPro.');
      const profile = await sb.from('profiles').select('organization_id').eq('id',session.user.id).maybeSingle();
      if (profile.error) throw profile.error;
      orgId = profile.data?.organization_id || '';
      if (!orgId) throw new Error('Não foi possível identificar sua organização.');
      let result = await sb.from('clients').select('id,name,whatsapp,uf,organization_id').eq('organization_id',orgId).order('name');
      if (result.error && /column .*uf.* does not exist/i.test(result.error.message)) {
        result = await sb.from('clients').select('id,name,whatsapp,organization_id').eq('organization_id',orgId).order('name');
        if (!result.error) result.data = result.data.map(c=>({...c,uf:null}));
      }
      if (result.error) throw result.error;
      rows = result.data || [];
      await ensureGeo();
      render();
    } catch (error) {
      $('gpcmMap').innerHTML = '<div class="gpcm-empty">'+esc(error.message || 'Não foi possível carregar o mapa.')+'</div>';
      $('gpcmChart').innerHTML = '';
    }
  }

  async function ensureGeo() {
    if (mapReady) return;
    const response = await fetch(GEOJSON_URL,{cache:'force-cache'});
    if (!response.ok) throw new Error('Não foi possível carregar o desenho geográfico do Brasil.');
    const data = await response.json();
    geoFeatures = (data.features || []).filter(f => {
      const uf = String(f.properties?.sigla || f.properties?.SIGLA || '').toUpperCase();
      f.properties = {...f.properties, _uf:uf};
      return state(uf);
    });
    if (geoFeatures.length !== 27) throw new Error('O mapa geográfico retornou uma quantidade inesperada de estados.');
    mapReady = true;
  }

  function coordinates(feature) {
    const g = feature.geometry;
    if (!g) return [];
    if (g.type === 'Polygon') return g.coordinates;
    if (g.type === 'MultiPolygon') return g.coordinates.flat();
    return [];
  }

  function renderMap(counts) {
    const all = geoFeatures.flatMap(f=>coordinates(f).flatMap(r=>r));
    const xs=all.map(p=>p[0]), ys=all.map(p=>p[1]);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const W=720,H=700,pad=18,scale=Math.min((W-pad*2)/(maxX-minX),(H-pad*2)/(maxY-minY));
    const ox=(W-(maxX-minX)*scale)/2, oy=(H-(maxY-minY)*scale)/2;
    const project=p=>[ox+(p[0]-minX)*scale, H-(oy+(p[1]-minY)*scale)];
    const paths=geoFeatures.map(f=>{
      const uf=f.properties._uf, count=counts[uf]||0;
      const d=coordinates(f).map(ring=>ring.map((p,i)=>{const q=project(p);return (i?'L':'M')+q[0].toFixed(1)+','+q[1].toFixed(1)}).join(' ')+' Z').join(' ');
      return '<path class="gpcm-state '+(selectedUF===uf?'selected':'')+'" data-uf="'+uf+'" d="'+d+'" fill="'+(count?COLOR[uf]:'#292536')+'" opacity="'+(count?'.96':'.78')+'"><title>'+esc(state(uf)[1])+': '+count+' cliente(s)</title></path>';
    }).join('');
    $('gpcmMap').innerHTML='<svg class="gpcm-map" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Mapa do Brasil dividido por estado">'+paths+'</svg>';
    $('gpcmMap').querySelectorAll('[data-uf]').forEach(p=>p.addEventListener('click',()=>selectState(p.dataset.uf)));
  }

  function renderChart(counts) {
    const sorted=STATES.map(s=>({uf:s[0],name:s[1],count:counts[s[0]]||0})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR'));
    const max=Math.max(1,...sorted.map(s=>s.count));
    $('gpcmChart').innerHTML=sorted.map(s=>'<div class="gpcm-bar-row" data-chart-uf="'+s.uf+'" style="cursor:pointer"><strong>'+s.uf+'</strong><div class="gpcm-bar" title="'+esc(s.name)+'"><i style="width:'+(s.count/max*100)+'%;background:'+(s.count?COLOR[s.uf]:'#454052')+'"></i></div><span style="text-align:right">'+s.count+'</span></div>').join('');
    $('gpcmChart').querySelectorAll('[data-chart-uf]').forEach(el=>el.addEventListener('click',()=>selectState(el.dataset.chartUf)));
  }

  function render() {
    const counts={}; let unknown=0;
    rows.forEach(c=>{const uf=clientUF(c);if(uf&&state(uf))counts[uf]=(counts[uf]||0)+1;else unknown++});
    $('gpcmTotal').textContent=rows.length;
    $('gpcmStates').textContent=Object.keys(counts).length;
    $('gpcmUnknown').textContent=unknown;
    renderMap(counts); renderChart(counts); renderClients();
    const selectedInfo = $('gpcmMapSelectedInfo');
    if (selectedInfo) selectedInfo.innerHTML = selectedUF ? esc(state(selectedUF)[1])+' ('+esc(selectedUF)+')<small>'+(counts[selectedUF]||0)+' cliente(s) identificado(s) neste estado</small>' : 'Toque em qualquer estado do mapa para ver o nome.';
  }

  function selectState(uf) {
    selectedUF = selectedUF === uf ? '' : uf;
    render();
  }

  function renderClients() {
    if (!$('gpcmClients')) return;
    const q=String($('gpcmSearch').value||'').trim().toLowerCase();
    const list=rows.filter(c=>{
      const uf=clientUF(c);
      return (!selectedUF || uf===selectedUF) && (!q || [c.name,c.whatsapp].some(v=>String(v||'').toLowerCase().includes(q)));
    });
    $('gpcmDetailTitle').textContent=selectedUF ? 'Clientes em '+state(selectedUF)[1] : 'Todos os clientes';
    $('gpcmDetailSub').textContent=list.length+' cliente(s)'+(selectedUF?' neste estado':' identificados/visíveis');
    $('gpcmClients').innerHTML=list.length ? list.map(c=>{
      const uf=clientUF(c)||'';
      const options='<option value="">Não identificado</option>'+STATES.map(s=>'<option value="'+s[0]+'" '+(s[0]===uf?'selected':'')+'>'+s[0]+' — '+esc(s[1])+'</option>').join('');
      return '<div class="gpcm-client"><div><strong>'+esc(c.name)+'</strong><div class="gpcm-muted">'+esc(c.whatsapp||'Sem WhatsApp')+' · '+(uf?esc(state(uf)[1]):'Estado não identificado')+'</div></div><select data-client-uf="'+esc(c.id)+'" aria-label="Estado de '+esc(c.name)+'">'+options+'</select></div>';
    }).join('') : '<div class="gpcm-empty">Nenhum cliente encontrado para este filtro.</div>';
    $('gpcmClients').querySelectorAll('[data-client-uf]').forEach(sel=>sel.addEventListener('change',()=>saveUF(sel.dataset.clientUf,sel.value)));
  }

  async function saveUF(id, uf) {
    const client=rows.find(c=>c.id===id);
    if (!client) return;
    const {error}=await sb.from('clients').update({uf:uf||null}).eq('id',id).eq('organization_id',orgId);
    if (error) { alert('Não foi possível atualizar o estado: '+error.message); renderClients(); return; }
    client.uf=uf||null;
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>{if(mount()){}});
  else mount();
})();