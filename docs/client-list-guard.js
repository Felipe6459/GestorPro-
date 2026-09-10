// GestorPro — proteção da lista de clientes.
// Mantém a tabela visível caso algum módulo posterior ao carregamento limpe o tbody.
(function(){
  let lastHtml='';
  let lastCount=0;
  let restoring=false;
  function capture(){
    const rows=document.getElementById('clientRows');
    if(!rows||restoring)return;
    const count=rows.querySelectorAll('tr').length;
    if(count>0){
      lastHtml=rows.innerHTML;
      lastCount=count;
      return;
    }
    const search=document.getElementById('search');
    if(lastCount>0 && !String(search?.value||'').trim()){
      restoring=true;
      rows.innerHTML=lastHtml;
      restoring=false;
    }
  }
  function boot(){
    const rows=document.getElementById('clientRows');
    if(!rows)return;
    if(rows.dataset.gpListGuard==='1')return;
    rows.dataset.gpListGuard='1';
    new MutationObserver(capture).observe(rows,{childList:true,subtree:true});
    capture();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1200));
  else setTimeout(boot,1200);
  new MutationObserver(boot).observe(document.documentElement,{childList:true,subtree:true});
})();
