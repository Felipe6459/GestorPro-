// Filtra a seção "Próximos vencimentos" da Dashboard sem alterar os clientes salvos.
// Mostra somente vencimentos de hoje até os próximos 7 dias e limita a 7 itens.
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
    if(!title) return null;
    return title.closest('.panel') || title.parentElement;
  }

  function filter(){
    const section = findSection();
    if(!section) return;

    // Suporta a tabela tradicional e também a lista dinâmica do Dashboard.
    const container = section.querySelector('#dashRows') || section.querySelector('tbody') || section;
    let rows = [...container.children];
    if(container.tagName === 'TABLE') rows = [...container.querySelectorAll('tbody tr')];
    if(container.tagName === 'TBODY') rows = [...container.querySelectorAll('tr')];
    if(!rows.length) return;

    const today = dayStart(new Date());
    const limit = new Date(today);
    limit.setDate(limit.getDate() + DAYS_AHEAD);

    const parsed = rows.map((row, index) => {
      const date = parsePtDate(row.textContent);
      return {row, index, date};
    });

    const visible = parsed
      .filter(x => x.date && x.date >= today && x.date <= limit)
      .sort((a,b) => a.date - b.date || a.index - b.index)
      .slice(0, MAX_ITEMS);
    const keep = new Set(visible.map(x => x.row));

    parsed.forEach(x => {
      x.row.style.display = keep.has(x.row) ? '' : 'none';
    });
  }

  function boot(){ setTimeout(filter, 700); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(filter, 150);
  }).observe(document.body, {childList:true, subtree:true});
})();
