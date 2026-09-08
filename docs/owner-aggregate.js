// GestorPro — carregadores finais dos módulos financeiros.
// O painel já carrega este arquivo; o módulo direto corrige especificamente
// os cards da aba Financeiro, sem depender do Dashboard.
import('./dashboard-finance-fix.js?v=20260908').catch(err=>console.error('GestorPro dashboard financeiro:',err));
import('./finance-direct-fix.js?v=20260908').catch(err=>console.error('GestorPro financeiro:',err));
