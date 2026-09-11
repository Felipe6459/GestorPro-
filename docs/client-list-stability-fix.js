// GestorPro — estabiliza a lista de clientes sem observar a Dashboard inteira.
(function(){
  let lastRows='';
  let active=false;
  function watch(){
    const rows=document.getElementById('clientRows');
    if(!rows||rows.dataset.gpStable==='1')return;
    rows.dataset.gpStable='1';
    const save=()=>{
      const n=rows.querySelectorAll('tr').length;
      if(n>0)lastRows=rows.innerHTML;
      else if(lastRows&&!document.getElementById('search')?.value.trim())rows.innerHTML=lastRows;
    };
    new MutationObserver(save).observe(rows,{childList:true,subtree:true});
    save();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch);else watch();
})();
