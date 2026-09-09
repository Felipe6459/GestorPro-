/* GestorPro — proteção do DOM do painel. */
(function(){
  function ensure(){
    if(document.getElementById('templates'))return;
    const el=document.createElement('div');
    el.id='templates';
    el.style.display='none';
    document.body.appendChild(el);
  }
  ensure();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure);
  new MutationObserver(ensure).observe(document.documentElement,{childList:true,subtree:true});
})();
