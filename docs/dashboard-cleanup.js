// GestorPro — limpeza visual da Dashboard do vendedor
// Mantém os registros no banco e remove apenas o histórico detalhado de consumo da Dashboard.
(()=>{
  function clean(){
    document.querySelectorAll('.panel').forEach(p=>{
      const text=(p.textContent||'').toLowerCase();
      if(text.includes('consumo de créditos')||text.includes('consumo de creditos')){
        p.style.setProperty('display','none','important');
      }
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(clean,100));
  else setTimeout(clean,100);
  new MutationObserver(clean).observe(document.body,{childList:true,subtree:true});
})();
