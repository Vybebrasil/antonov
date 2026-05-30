/* Destino dos leads — endpoints por tipo de formulário */
window.ANTONOV_LEADS = {
  provider: 'neon',
  apiUrls: {
    preMatricula: '/api/leads/pre-matricula',
    curriculos: '/api/leads/curriculos',
    tour: '/api/leads/tour',
  },
  /* legado — roteador por origem */
  apiUrl: '/api/leads',
  webhookUrl: '',
};

window.ANTONOV_VIP_LEADS = window.ANTONOV_LEADS;
