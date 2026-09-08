// GestorPro — carregador do cálculo financeiro corrigido.
// Este arquivo já é carregado pelo painel; usamos ele apenas para iniciar
// o módulo financeiro com isolamento por organização/vendedor.
import('./dashboard-finance-fix.js?v=20260908').catch(err=>console.error('GestorPro financeiro:',err));
