/* GestorPro - correção isolada da navegação das abas */
(function(){
  function bind(){
    const tabs=[...document.querySelectorAll('.tabs button[data-v]')];
    const views=[...document.querySelectorAll('.view')];
    if(!tabs.length||!views.length)return;
    tabs.forEach(btn=>{
      if(btn.dataset.gpTabFix)return;
      btn.dataset.gpTabFix='1';
      btn.addEventListener('click',function(e){
        e.preventDefault();
        const id=this.dataset.v;
        if(!id)return;
        views.forEach(v=>v.classList.toggle('active',v.id===id));
        tabs.forEach(b=>b.classList.toggle('active',b===this));
        window.dispatchEvent(new CustomEvent('gestorpro:tabchange',{detail:{id}}));
      },true);
    });
    const active=tabs.find(b=>b.dataset.v==='dash');
    if(active&&!tabs.some(b=>b.classList.contains('active')))active.classList.add('active');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,100));else setTimeout(bind,100);
  new MutationObserver(bind).observe(document.documentElement,{childList:true,subtree:true});
})();
