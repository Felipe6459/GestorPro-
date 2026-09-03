// Integrações estáveis do GestorPro.
import 'https://raw.githubusercontent.com/Felipe6459/GestorPro-/81062285db5973e4ee582b46429468df7a4ee619/docs/creditos.js';
import './whatsapp-fila.js';
import './configuracoes-whatsapp.js';

function ensureConfigButton(){
  const tabs=document.querySelector('.tabs');
  if(!tabs || document.getElementById('gpConfigTab')) return;
  const button=document.createElement('button');
  button.id='gpConfigTab';
  button.type='button';
  button.textContent='⚙ Configurações';
  button.dataset.v='settings';
  button.onclick=()=>{
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    const view=document.getElementById('settings');
    if(view) view.classList.add('active');
  };
  tabs.appendChild(button);
}

function bootConfigButton(){
  ensureConfigButton();
  setTimeout(ensureConfigButton,300);
  setTimeout(ensureConfigButton,1000);
  setTimeout(ensureConfigButton,2000);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bootConfigButton);
else bootConfigButton();
