// GestorPro — correção do campo Valor do cliente.
// Permite valores digitados no padrão brasileiro (ex.: 25,00) e normaliza
// antes do listener original do formulário gravar o cliente no Supabase.
(function(){
  function normalizeValue(input){
    if(!input) return;
    let raw=String(input.value??'').trim().replace(/\s/g,'').replace(/R\$/gi,'');
    if(!raw) return;
    if(raw.includes(',')){
      raw=raw.replace(/\./g,'').replace(',','.');
    }
    const n=Number(raw);
    if(Number.isFinite(n)) input.value=n.toFixed(2);
  }

  function install(){
    const input=document.getElementById('value');
    const form=document.getElementById('clientForm');
    if(!input || !form) return false;

    // O input number pode rejeitar "25,00" antes do JavaScript receber o valor.
    // Por isso usamos texto + teclado decimal e normalizamos no envio.
    input.type='text';
    input.inputMode='decimal';
    input.placeholder='0,00';
    input.addEventListener('blur',()=>normalizeValue(input));
    form.addEventListener('submit',()=>normalizeValue(input),true);
    return true;
  }

  if(!install()){
    const mo=new MutationObserver(()=>{
      if(install()) mo.disconnect();
    });
    mo.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>mo.disconnect(),10000);
  }
})();
