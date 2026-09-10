// GestorPro — Próximos vencimentos
// Filtra a seção sem permitir que a lista antiga apareça antes do resultado final.
(function(){
  const DAYS_AHEAD = 7;
  const MAX_ITEMS = 7;
  const DATE_RE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;

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

  function filter(){
    const section = findSection();
    if(!section) return;

    // Mantém a seção invisível durante a montagem da tabela.
    section.style.visibility = 'hidden';

    const container = section.querySelector('#dashRows') || section.querySelector('tbody');
    if(!container) return;

    const rows = [...container.querySelectorAll('tr')];
    if(!rows.length) return;

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

    // Só libera a seção depois de aplicar o filtro.
    section.style.visibility = 'visible';
  }

  function boot(){
    const section = findSection();
    if(section) section.style.visibility = 'hidden';
    filter();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();

  // MutationObserver executa o filtro imediatamente no mesmo ciclo de atualização,
  // evitando o intervalo em que a lista antiga ficava visível.
  new MutationObserver(filter).observe(document.body,{childList:true,subtree:true});
})();
