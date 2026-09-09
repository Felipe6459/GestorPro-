/* GestorPro — proteção do DOM do painel.
   Alguns módulos opcionais podem remover áreas antigas antes do carregamento principal terminar.
   Mantém os alvos do render existentes sem alterar as funções do painel. */
(function(){
  function ensure(){
    const dash=document.getElementById('dash');
    if(!dash)return;
    const targets=['dashRows','clientRows','serverRows','expenseRows'];
    targets.forEach(id=>{
      if(document.getElementById(id))return;
      const el=document.createElement('tbody');
      el.id=id;
      el.style.display='none';
      dash.appendChild(el);
    });
    if(!document.getElementById('templates')){
      const el=document.createElement('div');
      el.id='templates';
      el.style.display='none';
      document.body.appendChild(el);
    }
  }
  ensure();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure);
  new MutationObserver(ensure).observe(document.documentElement,{childList:true,subtree:true});
})();
