// GestorPro — remove somente a tabela antiga de consumo de créditos da Dashboard.
function removeLegacyCreditTable(){
  document.querySelectorAll('table').forEach(table=>{
    if(table.closest('#gpCreditChart') || table.querySelector('#dashRows')) return;
    const text=(table.textContent||'').toLowerCase();
    const headers=[...table.querySelectorAll('thead th')].map(x=>(x.textContent||'').toLowerCase()).join('|');
    const legacy=(headers.includes('preço por crédito')||headers.includes('custo total')||text.includes('consumo de créditos')||text.includes('consumo de creditos'));
    if(legacy){
      const owner=table.closest('.panel')||table;
      if(owner.id!=='gpCreditChart') owner.remove();
    }
  });
}
removeLegacyCreditTable();
new MutationObserver(removeLegacyCreditTable).observe(document.documentElement,{childList:true,subtree:true});
setInterval(removeLegacyCreditTable,500);
