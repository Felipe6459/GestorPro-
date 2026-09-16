const SUPABASE_URL='https://jbdjfmvdrwdfnuhqrprc.supabase.co';
const SUPABASE_KEY='sb_publishable_3ABEFAwN_wzmSu13EyVOwQ_h5Xfmz80';
const supabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

const IDS=['monthly_1','monthly_2','monthly_3','annual_1','annual_2','annual_3','whatsapp','instagram','pix_key','youtube','hero_title','hero_text','trial_text','content_count','quality_text','compatibility','faq1','faq2','faq3'];
const statusEl=()=>document.getElementById('status');
const setStatus=(msg,ok=false)=>{const e=statusEl();if(e){e.textContent=msg;e.className='status '+(ok?'ok':'err')}};
const val=id=>document.getElementById(id)?.value?.trim()||'';
const setVal=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??''};
const money=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):String(v??'—')};

function collect(){const c={};IDS.forEach(id=>c[id]=val(id));return c}
function fill(c){IDS.forEach(id=>setVal(id,c?.[id]??''));renderPreview(c||{})}

function renderPreview(c){
  const p=document.getElementById('sitePreview'); if(!p)return;
  const rows=[
    ['Mensal 1 tela',money(c.monthly_1)],['Mensal 2 telas',money(c.monthly_2)],['Mensal 3 telas',money(c.monthly_3)],
    ['Anual 1 tela',money(c.annual_1)],['Anual 2 telas',money(c.annual_2)],['Anual 3 telas',money(c.annual_3)],
    ['WhatsApp',c.whatsapp||'—'],['Instagram',c.instagram||'—'],['Pix',c.pix_key||'—'],['YouTube',c.youtube||'—'],
    ['Título',c.hero_title||'—'],['Texto principal',c.hero_text||'—'],['Teste grátis',c.trial_text||'—'],
    ['Conteúdos',c.content_count||'—'],['Qualidade',c.quality_text||'—'],['Compatibilidade',c.compatibility||'—']
  ];
  p.innerHTML='<h3>👀 O que já está configurado no site</h3><div class="preview-grid">'+rows.map(r=>'<div class="preview-item"><span>'+r[0]+'</span><strong>'+String(r[1]).replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</strong></div>').join('')+'</div><div class="preview-faq"><strong>FAQs atuais</strong><p><b>1.</b> '+(c.faq1||'—')+'</p><p><b>2.</b> '+(c.faq2||'—')+'</p><p><b>3.</b> '+(c.faq3||'—')+'</p></div>';
}

async function guard(){
  const {data:{user},error:e}=await supabase.auth.getUser();
  if(e||!user){location.href='./index.html';return null}
  const {data:p,error}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
  if(error||!/master|owner|admin|dono/i.test(String(p?.role||''))){document.body.innerHTML='<div style="padding:40px;text-align:center;font-family:Arial">Acesso não autorizado.<br><br><button onclick="location.href=\'./painel.html\'">Voltar</button></div>';return null}
  return user;
}

async function load(){
  setStatus('Carregando informações atuais do site...');
  const {data,error}=await supabase.from('cineplay_site_settings').select('content,updated_at,updated_by').eq('id',1).maybeSingle();
  if(error){setStatus('Erro ao carregar: '+error.message);return}
  const c=data?.content||{};
  fill(c);
  const stamp=data?.updated_at?new Date(data.updated_at).toLocaleString('pt-BR'):'ainda não informado';
  setStatus(data?'Configurações carregadas. Última atualização: '+stamp:'Nenhuma configuração salva ainda.',!!data);
}

async function save(){
  const user=await guard();if(!user)return;
  const btn=document.getElementById('save');if(btn)btn.disabled=true;
  setStatus('Salvando alterações...');
  const {error}=await supabase.from('cineplay_site_settings').upsert({id:1,content:collect(),updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:'id'});
  if(btn)btn.disabled=false;
  if(error){setStatus('Erro ao salvar: '+error.message);return}
  const c=collect();renderPreview(c);setStatus('✅ Alterações salvas. O site público usará estes dados na próxima abertura/atualização.',true);
}

window.salvarCineplay=save;
window.recarregarCineplay=load;
window.abrirCineplay=()=>{window.open('https://www.cineplayftv.shop/','_blank','noopener,noreferrer')|| (location.href='https://www.cineplayftv.shop/')};

window.addEventListener('DOMContentLoaded',async()=>{
  document.getElementById('form')?.addEventListener('submit',e=>{e.preventDefault();save()});
  document.getElementById('reload')?.addEventListener('click',load);
  document.getElementById('openSite')?.addEventListener('click',window.abrirCineplay);
  const user=await guard();if(user)await load();
});
