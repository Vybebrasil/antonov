/* Configure o destino dos leads do pré-cadastro de inauguração. */
window.ANTONOV_VIP_LEADS = {
  /* 'local' = salva no navegador (demo) | 'webhook' | 'supabase' */
  provider: 'local',

  /* Ex.: https://formspree.io/f/SEU_ID ou Google Apps Script */
  webhookUrl: '',

  supabase: {
    url: '',
    anonKey: '',
    table: 'vip_leads',
    /* SQL sugerido:
    create table vip_leads (
      id uuid primary key default gen_random_uuid(),
      nome text not null,
      email text not null,
      telefone text not null,
      interesse text,
      mensagem text,
      origem text,
      page text,
      created_at timestamptz default now()
    );
    */
  },
};
