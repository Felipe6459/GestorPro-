// GestorPro — Próximos vencimentos
// Filtra a seção sem deixar a lista antiga aparecer antes do filtro.
(function(){
  const DAYS_AHEAD = 7;
  const MAX_ITEMS = 7;
  const DATE_RE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;
  let ready = false;
  let timer = null;

  function dayStart(d){
    const x = new Date(d);
    x.setHours(0,0,0,0);
    return x;
  }

  function parsePtDate(text){
    const m = String(text || '').match(DATE_RE);
    if(!m) return null;
    const d = new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : dayStart(d);
  }

  function findSection(){
    const title = [...document.querySelectorAll('h1,h2,h3,h4,h5,strong,div')]
      .find(el => (el.textContent || '').trim() === 'Próximos vencimentos');
    return title ? (title.closest('.panel') || title.parentElement) : null;
  }

  function rowsFrom(container){
    if(!container) return [];
    if(container.tagName === 'TABLE') return [...container.querySelectorAll('tbody tr')];
    if(container.tagName === 'TBODY') return [...container.querySelectorAll('tr')];
    return [...container.children];
  }

  function filter(){
    const section = findSection();
    if(!section) return false;

    // Enquanto o Dashboard ainda está montando a tabela, ela fica invisível.
    // Assim a lista completa não pisca na tela antes de ser filtrada.
    if(!ready) section.style.visibility = 'hidden';

    const container = section.querySelector('#dashRows') || section.querySelector('tbody');
    const rows = rowsFrom(container);
    if(!rows.length) return false;

    const today = dayStart(new Date());
    const limit = new Date(today);
    limit.setDate(limit.getDate() + DAYS_AHEAD);

    const parsed = rows.map((row,index)=>({row,index,date:parsePtDate(row.textContent)}));
    const visible = parsed
      .filter(x=>x.date && x.date >= today && x.date <= limit)
      .sort((a,b)=>a.date-b.date || a.index-b.index)
      .slice(0,MAX_ITEMS);
    const keep = new Set(visible.map(x=>x.row));

    parsed.forEach(x=>{
      x.row.style.display = keep.has(x.row) ? '' : 'none';
    });

    section.style.visibility = 'visible';
    ready = true;
    return true;
  }

  function schedule(){
    clearTimeout(timer);
    timer = setTimeout(filter, 80);
  }

  function boot(){
    // Esconde imediatamente a seção para impedir o flash da lista antiga.
    const section = findSection();
    if(section) section.style.visibility = 'hidden';
    schedule();
    setTimeout(filter, 350);
    setTimeout(filter, 900);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();

  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
})();
