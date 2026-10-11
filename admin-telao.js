const telaoState = {
  view: 'visao',
  clientes: [],
  contratos: [],
  criativos: [],
  parceiros: [],
  dragId: '',
  rebootArmed: false,
  config: null,
  wizard: { step: null, open: false, test: null, testing: false },
};

function tlEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function tlMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function tlDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year ? `${day}/${month}/${year}` : '—';
}

function tlWhen(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Bahia' });
}

function tlBytes(value) {
  const n = Number(value || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function tlBadge(status) {
  const tone = {
    ativo: 'badge-dynamic', pago: 'badge-dynamic', vencido: 'badge-archived',
    atrasado: 'badge-archived', cancelado: 'badge-archived', pausado: 'badge-legacy', rascunho: 'badge-legacy',
  }[status] || 'badge-legacy';
  return `<span class="badge ${tone}">${tlEsc(status || '—')}</span>`;
}

function tlError(message) {
  const el = document.getElementById('telao-error');
  if (!el) return;
  if (!message) {
    el.textContent = '';
    el.setAttribute('hidden', '');
    return;
  }
  el.textContent = message;
  el.removeAttribute('hidden');
}

function tlLoading(on) {
  const el = document.getElementById('telao-loading');
  if (!el) return;
  if (on) el.removeAttribute('hidden');
  else el.setAttribute('hidden', '');
}

function tlModal(html) {
  const modal = document.getElementById('telao-modal');
  const body = document.getElementById('telao-modal-body');
  if (!modal || !body) return;
  body.innerHTML = html;
  modal.removeAttribute('hidden');
  body.querySelector('input, select, textarea')?.focus();
}

function closeTelaoModal() {
  document.getElementById('telao-modal')?.setAttribute('hidden', '');
}

function syncTelaoNav() {
  document.querySelectorAll('[data-telao-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.telaoView === telaoState.view);
  });
}

function contratoOptions(selected) {
  const options = telaoState.contratos.map((item) => (
    `<option value="${item.id}" ${String(selected || '') === String(item.id) ? 'selected' : ''}>${tlEsc(item.cliente_name)} · ${tlEsc(item.title || 'Contrato')} (${tlDate(item.starts_on)} – ${tlDate(item.ends_on)})</option>`
  )).join('');
  return `<option value="">Institucional / sem contrato</option>${options}`;
}

function clienteOptions(selected) {
  return telaoState.clientes.map((item) => (
    `<option value="${item.id}" ${String(selected || '') === String(item.id) ? 'selected' : ''}>${tlEsc(item.name)}</option>`
  )).join('');
}

function renderVisao(data) {
  const online = data.player?.online;
  const dot = online == null ? '' : `<span class="tl-dot ${online ? 'tl-dot--on' : 'tl-dot--off'}"></span>`;
  const pages = (data.playlist?.pages || []).map((page, index) => `<li>${index + 1}. ${tlEsc(page.name)}${page.cliente_name ? ` · ${tlEsc(page.cliente_name)}` : ''}</li>`).join('') || '<li>Nada programado para hoje.</li>';
  const ending = (data.ending || []).map((item) => `<li>${tlEsc(item.cliente_name)} encerra em ${tlDate(item.ends_on)} ${item.whatsapp_url ? `<a href="${tlEsc(item.whatsapp_url)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</li>`).join('') || '<li>Nenhum contrato encerra nesta semana.</li>';
  document.getElementById('telao-content').innerHTML = `
    <div class="stats-grid">
      <article class="stat-card"><p class="stat-card__lbl">Telão</p><p class="stat-card__num" style="font-size:1.4rem">${dot}${online == null ? 'Sem leitura' : online ? 'Online' : 'Offline'}</p></article>
      <article class="stat-card stat-card--blue"><p class="stat-card__lbl">Disponibilidade 24h</p><p class="stat-card__num">${data.uptime24h == null ? '—' : `${data.uptime24h}%`}</p></article>
      <article class="stat-card stat-card--ink"><p class="stat-card__lbl">No ar hoje</p><p class="stat-card__num">${data.playlist?.count || 0}</p></article>
    </div>
    <div class="tl-toolbar">
      <p>${data.playlist?.fallback ? 'Exibindo conteúdo institucional.' : 'Playlist comercial do dia.'} Última publicação: ${tlWhen(data.lastPublish?.created_at)} ${data.lastPublish?.confirmado_em ? '· confirmada' : ''}</p>
      ${data.playlist?.note ? `<p class="tl-warn">${tlEsc(data.playlist.note)}</p>` : ''}
      <div class="tl-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-tl="status">Ler status agora</button>
        <button type="button" class="btn btn-primary btn-sm" data-tl="publicar">Publicar no telão</button>
      </div>
    </div>
    ${data.novacloud ? '' : '<p class="tl-warn">NovaCloud ainda não configurada neste ambiente.</p>'}
    ${data.storage ? '' : '<p class="tl-warn">Storage de criativos ainda não configurado.</p>'}
    <div class="tl-form-row">
      <section class="tl-card"><h3>Playlist</h3><ol>${pages}</ol></section>
      <section class="tl-card"><h3>Contratos da semana</h3><ul>${ending}</ul><p>${data.latePayments || 0} pagamento(s) em atraso.</p></section>
    </div>`;
}

function renderClientes() {
  const rows = telaoState.clientes.map((item) => `
    <tr>
      <td>${tlEsc(item.name)}</td>
      <td>${tlEsc(item.contact_name || '—')}</td>
      <td>${tlEsc(item.whatsapp || item.email || '—')}</td>
      <td>${tlEsc(item.partner_name || '—')}</td>
      <td>${tlBadge(item.status)}</td>
      <td class="tl-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-tl="editar-cliente" data-id="${item.id}">Editar</button>
        <button type="button" class="btn btn-ghost btn-sm" data-tl="excluir-cliente" data-id="${item.id}">Excluir</button>
      </td>
    </tr>`).join('');
  document.getElementById('telao-content').innerHTML = `
    <div class="tl-toolbar"><p>${telaoState.clientes.length} cliente(s)</p><button type="button" class="btn btn-primary btn-sm" data-tl="novo-cliente">Novo cliente</button></div>
    <table class="data-table"><thead><tr><th>Cliente</th><th>Contato</th><th>WhatsApp / e-mail</th><th>Parceiro</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6">Nenhum cliente cadastrado.</td></tr>'}</tbody></table>`;
}

function renderContratos() {
  const rows = telaoState.contratos.map((item) => `
    <tr>
      <td>${tlEsc(item.cliente_name)}</td>
      <td>${tlEsc(item.title || '—')}</td>
      <td>${tlDate(item.starts_on)} – ${tlDate(item.ends_on)}</td>
      <td>${tlMoney(item.price)}</td>
      <td>${item.insercoes_por_ciclo}/h</td>
      <td>${tlBadge(item.status)}</td>
      <td class="tl-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-tl="pagamentos" data-id="${item.id}">Pagamentos</button>
        <button type="button" class="btn btn-secondary btn-sm" data-tl="editar-contrato" data-id="${item.id}">Editar</button>
        ${item.whatsapp_url ? `<a class="btn btn-ghost btn-sm" href="${tlEsc(item.whatsapp_url)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      </td>
    </tr>`).join('');
  document.getElementById('telao-content').innerHTML = `
    <div class="tl-toolbar"><p>O cron das 00:05 publica sozinho quando um contrato entra ou sai.</p><button type="button" class="btn btn-primary btn-sm" data-tl="novo-contrato">Novo contrato</button></div>
    <table class="data-table"><thead><tr><th>Cliente</th><th>Título</th><th>Período</th><th>Valor</th><th>Por hora</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7">Nenhum contrato.</td></tr>'}</tbody></table>
    <div id="telao-pagamentos"></div>`;
}

function renderCriativos() {
  const cards = telaoState.criativos.map((item) => {
    const media = item.kind === 'VIDEO'
      ? `<video src="${tlEsc(item.public_url)}" muted></video>`
      : `<img src="${tlEsc(item.public_url)}" alt="" />`;
    return `
      <article class="tl-card" draggable="true" data-creative="${tlEsc(item.id)}">
        ${media}
        <h3>${tlEsc(item.name)}</h3>
        <p>${item.kind === 'VIDEO' ? 'Vídeo' : `${Math.round(item.duration_ms / 1000)}s`} · ${tlBytes(item.size_bytes)} · ${item.institutional ? 'Institucional' : tlEsc(item.cliente_name || 'Sem contrato')}</p>
        <p>${item.block_reason ? tlEsc(item.block_reason) : 'Entra na playlist de hoje'}</p>
        ${item.aspect_warning ? `<p class="tl-warn">${tlEsc(item.aspect_warning)}</p>` : ''}
        <div class="tl-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-tl="editar-criativo" data-id="${tlEsc(item.id)}">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm" data-tl="excluir-criativo" data-id="${tlEsc(item.id)}">Excluir</button>
        </div>
      </article>`;
  }).join('');
  document.getElementById('telao-content').innerHTML = `
    <div class="tl-toolbar">
      <p>Arraste os cards para definir a ordem. Cada publicação substitui a programação inteira.</p>
      <div class="tl-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-tl="novo-criativo">Novo criativo</button>
        <button type="button" class="btn btn-primary btn-sm" data-tl="publicar">Publicar no telão</button>
      </div>
    </div>
    <div class="tl-grid">${cards || '<p>Nenhum criativo enviado.</p>'}</div>`;
}

function renderMonitor(data) {
  const online = data.player?.online;
  const incidents = (data.incidentes || []).map((item) => `<li>${tlWhen(item.started_at)} ${item.ended_at ? `até ${tlWhen(item.ended_at)}` : '· em aberto'}</li>`).join('') || '<li>Nenhum incidente registrado.</li>';
  document.getElementById('telao-content').innerHTML = `
    <div class="tl-toolbar">
      <p><span class="tl-dot ${online ? 'tl-dot--on' : 'tl-dot--off'}"></span>${online ? 'Online' : online == null ? 'Sem leitura' : 'Offline'} · visto ${tlWhen(data.player?.last_seen_at)} · ${tlEsc(data.player?.ip || '')}</p>
      <button type="button" class="btn btn-secondary btn-sm" data-tl="status">Ler status agora</button>
    </div>
    <p>Disponibilidade 24h: ${data.uptime24h == null ? '—' : `${data.uptime24h}%`} · 7 dias: ${data.uptime7d == null ? '—' : `${data.uptime7d}%`} · firmware ${tlEsc(data.player?.firmware || '—')}</p>
    ${data.captura?.url ? `<img class="tl-shot" src="${tlEsc(data.captura.url)}" alt="Última captura do telão" />` : '<p>Nenhuma captura recebida.</p>'}
    <div class="tl-actions">
      <button type="button" class="btn btn-secondary btn-sm" data-tl="controle" data-action="capture">Capturar tela</button>
      <button type="button" class="btn btn-secondary btn-sm" data-tl="controle" data-action="screen" data-value="OPEN">Acender</button>
      <button type="button" class="btn btn-secondary btn-sm" data-tl="controle" data-action="screen" data-value="CLOSE">Tela preta</button>
      <button type="button" class="btn btn-ghost btn-sm" data-tl="armar-reboot">${telaoState.rebootArmed ? 'Confirmar reinício' : 'Reiniciar player'}</button>
    </div>
    <form class="tl-form tl-card" data-tl-form="nivel" style="margin-top:1rem">
      <div class="tl-form-row">
        <label>Brilho (0–100)<input name="brightness" type="number" min="0" max="100" value="80" /></label>
        <label>Volume (0–100)<input name="volume" type="number" min="0" max="100" value="0" /></label>
      </div>
      <div class="tl-actions">
        <button type="submit" class="btn btn-secondary btn-sm" name="apply" value="brightness">Aplicar brilho</button>
        <button type="submit" class="btn btn-secondary btn-sm" name="apply" value="volume">Aplicar volume</button>
      </div>
    </form>
    <h3>Incidentes</h3><ul>${incidents}</ul>`;
}

const TELAO_WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function renderConfiguracao(data) {
  const open = String(data.open_time || '06:00').slice(0, 5);
  const close = String(data.close_time || '23:00').slice(0, 5);
  const days = new Set(String(data.week_days || '0,1,2,3,4,5,6').split(','));
  const seconds = Math.round((Number(data.default_duration_ms) || 10000) / 1000);
  const player = data.player || {};
  const daysHtml = TELAO_WEEK_DAYS.map((label, index) => (
    `<label class="tl-check"><input type="checkbox" name="week_day" value="${index}" ${days.has(String(index)) ? 'checked' : ''} /> ${label}</label>`
  )).join('');
  telaoState.config = data;
  document.getElementById('telao-content').innerHTML = `
    <section class="tl-card tl-wizard" id="tl-wizard" aria-live="polite"></section>
    <form class="tl-form tl-config" data-tl-form="config">
      <section class="tl-card">
        <h3>Telão</h3>
        <div class="tl-form-row">
          <label>Nome<input name="player_name" value="${tlEsc(player.name || '')}" required maxlength="80" /></label>
          <label>Largura (px)<input name="width" type="number" min="1" max="8000" value="${player.width || 400}" required /></label>
          <label>Altura (px)<input name="height" type="number" min="1" max="8000" value="${player.height || 400}" required /></label>
        </div>
        <p>Player vinculado: ${tlEsc(player.player_id || 'nenhum')} · série ${tlEsc(player.sn || '—')}</p>      </section>
      <section class="tl-card">
        <h3>Programação</h3>
        <div class="tl-form-row">
          <label>Abre<input name="open_time" type="time" value="${open}" required /></label>
          <label>Fecha<input name="close_time" type="time" value="${close}" required /></label>
          <label>Duração padrão da imagem (s)<input name="default_duration_seconds" type="number" min="1" max="300" value="${seconds}" required /></label>
        </div>
        <label class="tl-check"><input type="checkbox" name="institutional_fallback" ${data.institutional_fallback !== false ? 'checked' : ''} /> Completar a hora com o institucional, para manter as vezes por hora</label>
        <div class="tl-week" role="group" aria-label="Dias da programação">${daysHtml}</div>
      </section>
      <section class="tl-card">
        <h3>Alertas</h3>
        <div class="tl-form-row">
          <label>Minutos offline antes do e-mail<input name="alert_after_minutes" type="number" min="5" max="240" value="${data.alert_after_minutes || 15}" required /></label>
          <label>Destinatários<input name="alert_emails" value="${tlEsc(data.alert_emails || '')}" placeholder="separados por vírgula" /></label>
        </div>
        <label class="tl-check"><input type="checkbox" name="contract_notices" ${data.contract_notices !== false ? 'checked' : ''} /> Avisar 7, 3 e 1 dia antes do fim do contrato</label>
      </section>
      <section class="tl-card">
        <h3>Publicação</h3>
        <label class="tl-check"><input type="checkbox" name="auto_publish" ${data.auto_publish !== false ? 'checked' : ''} /> A rotina das 00:05 pode publicar sozinha quando um contrato entra ou sai</label>
        <p>O botão Publicar no telão continua disponível.</p>
        <button type="submit" class="btn btn-primary btn-sm">Salvar configuração</button>
      </section>
    </form>`;
  renderWizard();
}

const TELAO_SITE = 'https://www.antonovcenter.com.br';
const TELAO_PLAYER_ID = '15a8cf02165316f9985afa918e935489';

function wizardSteps(data) {
  const test = telaoState.wizard.test;
  return [
    { key: 'novacloud', title: 'Chaves da NovaCloud', done: Boolean(data.novacloud) },
    { key: 'vercel', title: 'Variáveis na Vercel', done: Boolean(data.novacloud && data.callback && data.cron) },
    { key: 'storage', title: 'Arquivos dos criativos', done: Boolean(data.storage) },
    { key: 'deploy', title: 'Novo deploy', done: Boolean(data.novacloud && data.callback && data.cron && data.storage) },
    { key: 'test', title: 'Teste do player', done: test ? Boolean(test.ok && test.online) : Boolean(data.novacloud && data.player?.online) },
  ];
}

function wizCopy(label) {
  return `<div class="tl-wiz-var"><code>${tlEsc(label)}</code><span></span><button type="button" class="btn btn-ghost btn-sm" data-tl="wiz-copy" data-copy="${tlEsc(label)}">Copiar nome</button></div>`;
}

function wizFixed(label, value) {
  return `<div class="tl-wiz-var tl-wiz-var--fixed"><code>${tlEsc(label)}</code><code class="tl-wiz-val">${tlEsc(value)}</code><span class="tl-actions"><button type="button" class="btn btn-ghost btn-sm" data-tl="wiz-copy" data-copy="${tlEsc(label)}">Copiar nome</button><button type="button" class="btn btn-ghost btn-sm" data-tl="wiz-copy" data-copy="${tlEsc(value)}">Copiar valor</button></span></div>`;
}

function wizToken(label) {
  return `<div class="tl-wiz-var"><code>${tlEsc(label)}</code><code class="tl-wiz-val" data-token-for="${tlEsc(label)}">clique em Gerar</code><button type="button" class="btn btn-ghost btn-sm" data-tl="wiz-token" data-name="${tlEsc(label)}">Gerar e copiar</button></div>`;
}

function wizardBody(key, data) {
  const ok = (flag, yes, no) => `<p class="tl-wiz-state ${flag ? 'is-ok' : 'is-off'}"><span class="tl-dot ${flag ? 'tl-dot--on' : 'tl-dot--off'}"></span>${flag ? yes : no}</p>`;
  if (key === 'novacloud') {
    return `
      ${ok(data.novacloud, 'O servidor já tem o AppKey e o AppSecret.', 'O servidor ainda não tem as chaves da NovaCloud.')}
      <ol>
        <li>Abra <a href="https://open-us.vnnox.com" target="_blank" rel="noopener">open-us.vnnox.com</a> e entre com a conta da Antonov.</li>
        <li>Vá em <strong>Authentication</strong> e copie o <strong>AppKey</strong>.</li>
        <li>Gere um <strong>AppSecret</strong> novo. O anterior foi exposto e não deve ser usado.</li>
        <li>Confira na lista de players se o <strong>T40_00000391</strong> (série 26514N000000391) aparece. Se não aparecer, a conta principal adiciona o aparelho pelo número de série.</li>
      </ol>
      <p class="tl-wiz-note">Guarde as duas chaves só para o próximo passo. Elas não entram neste painel.</p>`;
  }
  if (key === 'vercel') {
    return `
      ${ok(data.novacloud && data.callback && data.cron, 'As variáveis do telão já estão no servidor.', 'Ainda faltam variáveis no servidor.')}
      <p>Na Vercel, abra o projeto <strong>antonov</strong> → Settings → Environment Variables. Marque <strong>Production</strong> em cada uma.</p>
      <h4>Chaves que você copiou da NovaCloud</h4>
      ${wizCopy('NOVACLOUD_APP_KEY')}
      ${wizCopy('NOVACLOUD_APP_SECRET')}
      <h4>Valores fixos</h4>
      ${wizFixed('NOVACLOUD_PLAYER_ID', TELAO_PLAYER_ID)}
      ${wizFixed('SITE_URL', TELAO_SITE)}
      <h4>Senhas que o painel gera agora</h4>
      ${wizToken('TELAO_CALLBACK_TOKEN')}
      ${wizToken('CRON_SECRET')}
      <p class="tl-wiz-note">Cada senha aparece uma vez. Cole na Vercel antes de gerar a próxima.</p>`;
  }
  if (key === 'storage') {
    return `
      ${ok(data.storage, 'O armazenamento dos criativos está configurado.', 'O armazenamento dos criativos ainda não está configurado.')}
      <p>O caminho mais simples é conectar o Supabase pela aba <strong>Storage</strong> do projeto na Vercel. A integração cria as variáveis sozinha, inclusive com o prefixo <code>DB_</code>.</p>
      <p>Para gravar à mão, copie a <strong>Project URL</strong> e a chave <strong>service_role</strong> em Project Settings → API do <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">Supabase</a> e crie, em Production:</p>
      ${wizCopy('SUPABASE_URL')}
      ${wizCopy('SUPABASE_SERVICE_ROLE_KEY')}
      <p class="tl-wiz-note">O bucket <code>telao-criativos</code> é criado sozinho no primeiro envio.</p>`;
  }
  if (key === 'deploy') {
    const items = [
      [data.novacloud, 'NovaCloud'],
      [data.callback, 'Retorno de captura e confirmação'],
      [data.cron, 'Rotinas automáticas'],
      [data.storage, 'Arquivos'],
    ].map(([flag, label]) => `<li><span class="tl-dot ${flag ? 'tl-dot--on' : 'tl-dot--off'}"></span>${label}</li>`).join('');
    return `
      <p>A Vercel só entrega as variáveis novas depois de um deploy. Na aba <strong>Deployments</strong>, abra o último e use <strong>Redeploy</strong>.</p>
      <ul class="tl-conn">${items}</ul>
      <button type="button" class="btn btn-secondary btn-sm" data-tl="wiz-check">Verificar de novo</button>`;
  }
  const test = telaoState.wizard.test;
  let result = '<p class="tl-wiz-note">O teste consulta a NovaCloud e grava o status do player.</p>';
  if (telaoState.wizard.testing) result = '<p class="tl-wiz-state">Consultando a NovaCloud…</p>';
  else if (test?.skipped) result = ok(false, '', 'A NovaCloud ainda não está configurada no servidor. Volte ao passo 1.');
  else if (test && !test.ok) result = ok(false, '', tlEsc(test.error || 'Não foi possível falar com a NovaCloud.'));
  else if (test?.ok) {
    result = ok(test.online, `Player online${test.player?.ip ? ` · IP ${tlEsc(test.player.ip)}` : ''}${test.player?.firmware ? ` · firmware ${tlEsc(test.player.firmware)}` : ''}.`, 'A NovaCloud encontrou o player, mas ele está offline. Confira energia e internet do telão.');
  }
  return `
    ${result}
    <div class="tl-actions">
      <button type="button" class="btn btn-primary btn-sm" data-tl="wiz-test" ${telaoState.wizard.testing ? 'disabled' : ''}>Testar player</button>
      ${test?.ok && test.online ? '<button type="button" class="btn btn-secondary btn-sm" data-tl="wiz-criativos">Ir para Criativos</button>' : ''}
    </div>`;
}

function renderWizard() {
  const box = document.getElementById('tl-wizard');
  const data = telaoState.config;
  if (!box || !data) return;
  const steps = wizardSteps(data);
  const doneCount = steps.filter((step) => step.done).length;
  const allDone = doneCount === steps.length;
  const wizard = telaoState.wizard;
  if (wizard.step == null) wizard.step = Math.max(0, steps.findIndex((step) => !step.done));
  if (allDone && !wizard.open) {
    box.innerHTML = `
      <div class="tl-wiz-done">
        <p><span class="tl-dot tl-dot--on"></span><strong>Telão conectado.</strong> NovaCloud, arquivos e player responderam.</p>
        <button type="button" class="btn btn-ghost btn-sm" data-tl="wiz-open">Rever conexão</button>
      </div>`;
    return;
  }
  const index = Math.min(Math.max(wizard.step, 0), steps.length - 1);
  const current = steps[index];
  const nav = steps.map((step, i) => `
    <li>
      <button type="button" class="tl-wiz-step ${i === index ? 'is-current' : ''} ${step.done ? 'is-done' : ''}" data-tl="wiz-go" data-step="${i}" ${i === index ? 'aria-current="step"' : ''}>
        <span class="tl-wiz-num">${step.done ? '✓' : i + 1}</span><span class="tl-wiz-label">${step.title}</span>
      </button>
    </li>`).join('');
  box.innerHTML = `
    <div class="tl-wiz-head">
      <h3>Conectar o telão</h3>
      <span class="tl-wiz-count">${doneCount} de ${steps.length} prontos</span>
    </div>
    <div class="tl-wiz-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${doneCount}"><span style="width:${(doneCount / steps.length) * 100}%"></span></div>
    <ol class="tl-wiz-steps">${nav}</ol>
    <div class="tl-wiz-body">
      <h4 class="tl-wiz-title">Passo ${index + 1}. ${current.title}</h4>
      ${wizardBody(current.key, data)}
    </div>
    <div class="tl-wiz-foot">
      <button type="button" class="btn btn-ghost btn-sm" data-tl="wiz-prev" ${index === 0 ? 'disabled' : ''}>Voltar</button>
      ${index < steps.length - 1
        ? '<button type="button" class="btn btn-primary btn-sm" data-tl="wiz-next">Próximo</button>'
        : (allDone ? '<button type="button" class="btn btn-primary btn-sm" data-tl="wiz-close">Concluir</button>' : '')}
    </div>`;
}

function telaoToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function telaoCopy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const label = button.textContent;
    button.textContent = 'Copiado';
    setTimeout(() => { button.textContent = label; }, 1500);
  } catch {
    window.prompt('Copie o valor:', text);
  }
}

async function onWizardAction(action, button) {
  const wizard = telaoState.wizard;
  wizard.open = action !== 'wiz-close';
  if (action === 'wiz-next') wizard.step += 1;
  if (action === 'wiz-prev') wizard.step = Math.max(0, wizard.step - 1);
  if (action === 'wiz-go') wizard.step = Number(button.dataset.step) || 0;
  if (action === 'wiz-open') wizard.step = 0;
  if (action === 'wiz-copy') return telaoCopy(button.dataset.copy, button);
  if (action === 'wiz-token') {
    const token = telaoToken();
    const target = document.querySelector(`[data-token-for="${button.dataset.name}"]`);
    if (target) target.textContent = token;
    return telaoCopy(token, button);
  }
  if (action === 'wiz-check') {
    telaoState.config = await api('/telao/settings');
  }
  if (action === 'wiz-criativos') {
    telaoState.view = 'criativos';
    return loadTelaoView();
  }
  if (action === 'wiz-test') {
    wizard.testing = true;
    renderWizard();
    try {
      wizard.test = await api('/telao/status', { method: 'POST', body: '{}' });
    } catch (err) {
      wizard.test = { ok: false, error: err.message };
    } finally {
      wizard.testing = false;
    }
  }
  renderWizard();
}

function renderHistorico(data) {
  const rows = (data.publicacoes || []).map((item) => `
    <tr>
      <td>${tlWhen(item.created_at)}</td>
      <td>${tlEsc(item.trigger)}</td>
      <td>${item.creatives_count}</td>
      <td>${item.ok ? 'Sim' : 'Não'}</td>
      <td>${item.confirmado_em ? tlWhen(item.confirmado_em) : '—'}</td>
      <td>${tlEsc(item.error || '')}</td>
    </tr>`).join('');
  const from = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const iso = (date) => date.toISOString().slice(0, 10);
  document.getElementById('telao-content').innerHTML = `
    <table class="data-table"><thead><tr><th>Quando</th><th>Origem</th><th>Páginas</th><th>Ok</th><th>Confirmada</th><th>Erro</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Nenhuma publicação.</td></tr>'}</tbody></table>
    <form class="tl-form tl-card" data-tl-form="relatorio" style="margin-top:1rem">
      <h3>Relatório de exibição</h3>
      <div class="tl-form-row">
        <label>De<input type="date" name="from" value="${iso(start)}" required /></label>
        <label>Até<input type="date" name="to" value="${iso(from)}" required /></label>
      </div>
      <label>Cliente
        <select name="cliente_id"><option value="">Todos</option>${clienteOptions()}</select>
      </label>
      <button type="submit" class="btn btn-secondary btn-sm">Calcular</button>
    </form>
    <div id="telao-relatorio"></div>`;
}

async function loadTelaoView() {
  syncTelaoNav();
  tlError('');
  tlLoading(true);
  try {
    if (telaoState.view === 'visao') renderVisao(await api('/telao'));
    if (telaoState.view === 'clientes') {
      telaoState.clientes = (await api('/telao/clientes')).clientes;
      renderClientes();
    }
    if (telaoState.view === 'contratos') {
      const [contratos, clientes] = await Promise.all([api('/telao/contratos'), api('/telao/clientes')]);
      telaoState.contratos = contratos.contratos;
      telaoState.clientes = clientes.clientes;
      renderContratos();
    }
    if (telaoState.view === 'criativos') {
      const data = await api('/telao/criativos');
      telaoState.criativos = data.criativos;
      telaoState.contratos = data.contratos;
      renderCriativos();
    }
    if (telaoState.view === 'monitor') renderMonitor(await api('/telao/monitor'));
    if (telaoState.view === 'historico') {
      if (!telaoState.clientes.length) telaoState.clientes = (await api('/telao/clientes')).clientes;
      renderHistorico(await api('/telao/publicacoes'));
    }
    if (telaoState.view === 'configuracao') renderConfiguracao(await api('/telao/settings'));
  } catch (err) {
    tlError(err.message || 'Não foi possível carregar o telão.');
  } finally {
    tlLoading(false);
  }
}

function clienteForm(item = {}) {
  const partners = telaoState.parceiros.map((partner) => (
    `<option value="${partner.id}" ${String(item.partner_id || '') === String(partner.id) ? 'selected' : ''}>${tlEsc(partner.name)}</option>`
  )).join('');
  tlModal(`
    <h3 id="telao-modal-title">${item.id ? 'Editar cliente' : 'Novo cliente'}</h3>
    <form class="tl-form" data-tl-form="cliente">
      <input type="hidden" name="id" value="${item.id || ''}" />
      <label>Nome<input name="name" required value="${tlEsc(item.name || '')}" /></label>
      <div class="tl-form-row">
        <label>CPF/CNPJ<input name="document" value="${tlEsc(item.document || '')}" /></label>
        <label>Contato<input name="contact_name" value="${tlEsc(item.contact_name || '')}" /></label>
      </div>
      <div class="tl-form-row">
        <label>E-mail<input name="email" type="email" value="${tlEsc(item.email || '')}" /></label>
        <label>WhatsApp<input name="whatsapp" value="${tlEsc(item.whatsapp || '')}" /></label>
      </div>
      <label>Parceiro vinculado
        <select name="partner_id"><option value="">Nenhum</option>${partners}</select>
      </label>
      <label>Status
        <select name="status">
          ${['ativo', 'pausado', 'arquivado'].map((status) => `<option ${item.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
      </label>
      <label>Observações<textarea name="notes" rows="3">${tlEsc(item.notes || '')}</textarea></label>
      <div class="tl-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-tl-close>Cancelar</button>
        <button type="submit" class="btn btn-primary btn-sm">Salvar</button>
      </div>
    </form>`);
}

function contratoForm(item = {}) {
  tlModal(`
    <h3 id="telao-modal-title">${item.id ? 'Editar contrato' : 'Novo contrato'}</h3>
    <form class="tl-form" data-tl-form="contrato">
      <input type="hidden" name="id" value="${item.id || ''}" />
      <label>Cliente<select name="cliente_id" required><option value="">Selecione</option>${clienteOptions(item.cliente_id)}</select></label>
      <label>Título<input name="title" value="${tlEsc(item.title || '')}" /></label>
      <div class="tl-form-row">
        <label>Início<input type="date" name="starts_on" required value="${tlEsc(item.starts_on || '')}" /></label>
        <label>Fim<input type="date" name="ends_on" required value="${tlEsc(item.ends_on || '')}" /></label>
      </div>
      <div class="tl-form-row">
        <label>Valor total<input name="price" inputmode="decimal" value="${item.price ?? ''}" /></label>
        <label>Forma de pagamento<input name="payment_method" value="${tlEsc(item.payment_method || '')}" /></label>
      </div>
      <div class="tl-form-row">
        <label>Vezes por hora<input type="number" min="1" max="120" name="insercoes_por_ciclo" value="${item.insercoes_por_ciclo || 1}" /></label>
        <label>Parcelas<input type="number" min="0" max="36" name="parcelas" value="0" ${item.id ? 'disabled' : ''} /></label>
      </div>
      <p class="tl-wiz-note">Quantas vezes esse anunciante entra em uma hora. O institucional completa o intervalo quando essa opção está ligada na configuração.</p>
      <label>Status
        <select name="status">${['rascunho', 'ativo', 'pausado', 'vencido', 'cancelado'].map((status) => `<option ${(item.status || 'ativo') === status ? 'selected' : ''}>${status}</option>`).join('')}</select>
      </label>
      <label class="tl-check"><input type="checkbox" name="auto_renew" ${item.auto_renew ? 'checked' : ''} /> Renovar automaticamente</label>
      <label>Meses de cada renovação<input type="number" min="1" max="36" name="cycle_months" value="${item.cycle_months || 1}" /></label>
      <label>Observações<textarea name="notes" rows="3">${tlEsc(item.notes || '')}</textarea></label>
      <div class="tl-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-tl-close>Cancelar</button>
        <button type="submit" class="btn btn-primary btn-sm">Salvar</button>
      </div>
    </form>`);
}

function criativoForm(item = {}) {
  tlModal(`
    <h3 id="telao-modal-title">${item.id ? 'Editar criativo' : 'Novo criativo'}</h3>
    <form class="tl-form" data-tl-form="criativo">
      <input type="hidden" name="id" value="${tlEsc(item.id || '')}" />
      <label>Nome<input name="name" required value="${tlEsc(item.name || '')}" /></label>
      <label>Contrato<select name="contrato_id">${contratoOptions(item.contrato_id)}</select></label>
      ${item.id ? '' : '<label>Arquivo JPG, PNG ou MP4<input type="file" name="file" accept="image/jpeg,image/png,video/mp4" required /></label><p id="telao-file-warn" class="tl-warn" hidden></p>'}
      <label>Duração da imagem (segundos)<input type="number" min="1" max="300" name="seconds" value="${item.kind === 'VIDEO' ? 10 : Math.max(1, Math.round((item.duration_ms || 10000) / 1000))}" /></label>
      <div class="tl-form-row">
        <label>Início<input type="date" name="starts_on" value="${tlEsc(item.starts_on || '')}" /></label>
        <label>Fim<input type="date" name="ends_on" value="${tlEsc(item.ends_on || '')}" /></label>
      </div>
      <label class="tl-check"><input type="checkbox" name="institutional" ${item.institutional ? 'checked' : ''} /> Conteúdo institucional da Antonov</label>
      <label class="tl-check"><input type="checkbox" name="approved" ${item.id ? (item.approved ? 'checked' : '') : 'checked'} /> Aprovado para exibição</label>
      <label class="tl-check"><input type="checkbox" name="active" ${item.id && !item.active ? '' : 'checked'} /> Ativo</label>
      <div class="tl-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-tl-close>Cancelar</button>
        <button type="submit" class="btn btn-primary btn-sm">Salvar</button>
      </div>
    </form>`);
  document.querySelector('#telao-modal input[type="file"]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    const warn = document.getElementById('telao-file-warn');
    if (!file || !warn) return;
    const meta = await readMediaMeta(file);
    const message = aspectWarning(meta.width, meta.height);
    warn.textContent = message;
    if (message) warn.removeAttribute('hidden');
    else warn.setAttribute('hidden', '');
  });
}

function aspectWarning(width, height) {
  if (!width || !height) return '';
  if (Math.abs(width / height - 1) > 0.02) return `Proporção ${width}×${height}. O telão é 400×400.`;
  if (width !== 400 || height !== 400) return `Tamanho ${width}×${height}. O ideal é 400×400.`;
  return '';
}

function readMediaMeta(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('image/')) {
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight, duration: 0 }); };
      image.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0, duration: 0 }); };
      image.src = url;
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration || 0 }); };
    video.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0, duration: 0 }); };
    video.src = url;
  });
}

async function fitPictureFile(file) {
  if (!file.type.startsWith('image/')) return { file, width: 0, height: 0 };
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / bitmap.width, 1920 / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  if (scale === 1) return { file, width: bitmap.width, height: bitmap.height };
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
  if (!blob) return { file, width: bitmap.width, height: bitmap.height };
  const name = file.name.replace(/\.\w+$/, type === 'image/png' ? '.png' : '.jpg');
  return { file: new File([blob], name, { type }), width, height };
}

async function uploadCriativo(form) {
  const selected = form.querySelector('[name="file"]')?.files?.[0];
  if (!selected) throw new Error('Selecione o arquivo.');
  if (typeof telaoMd5Hex !== 'function') throw new Error('Não foi possível calcular o MD5.');
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.textContent = 'Enviando…';
  const fitted = await fitPictureFile(selected);
  const file = fitted.file;
  const meta = file === selected ? await readMediaMeta(file) : { width: fitted.width, height: fitted.height, duration: 0 };
  const md5 = telaoMd5Hex(await file.arrayBuffer());
  const signed = await api('/telao/uploads', {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  const put = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || signed.contentType, 'x-upsert': 'true' },
    body: file,
  });
  if (!put.ok) throw new Error('O storage recusou o arquivo.');
  const video = file.type === 'video/mp4';
  const seconds = Number(new FormData(form).get('seconds') || 10);
  await api('/telao/criativos', {
    method: 'POST',
    body: JSON.stringify({
      ...formFlags(form),
      id: signed.id,
      name: form.querySelector('[name="name"]').value,
      contrato_id: form.querySelector('[name="contrato_id"]').value,
      kind: video ? 'VIDEO' : 'PICTURE',
      storage_path: signed.path,
      public_url: signed.publicUrl,
      size_bytes: file.size,
      md5,
      width: meta.width || null,
      height: meta.height || null,
      duration_ms: video ? Math.round((meta.duration || 0) * 1000) : Math.round(seconds * 1000),
    }),
  });
}

function formFlags(form) {
  return {
    institutional: form.querySelector('[name="institutional"]')?.checked || false,
    approved: form.querySelector('[name="approved"]')?.checked || false,
    active: form.querySelector('[name="active"]')?.checked || false,
    auto_renew: form.querySelector('[name="auto_renew"]')?.checked || false,
    starts_on: form.querySelector('[name="starts_on"]')?.value || null,
    ends_on: form.querySelector('[name="ends_on"]')?.value || null,
  };
}

async function onTelaoSubmit(event) {
  const form = event.target.closest('form[data-tl-form]');
  if (!form) return;
  event.preventDefault();
  tlError('');
  const data = Object.fromEntries(new FormData(form).entries());
  const kind = form.dataset.tlForm;
  try {
    if (kind === 'cliente') {
      const payload = { ...data, ...formFlags(form) };
      if (data.id) await api(`/telao/clientes/${data.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/telao/clientes', { method: 'POST', body: JSON.stringify(payload) });
    }
    if (kind === 'contrato') {
      const payload = { ...data, ...formFlags(form), price: data.price, parcelas: data.id ? undefined : Number(data.parcelas || 0) };
      if (data.id) await api(`/telao/contratos/${data.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/telao/contratos', { method: 'POST', body: JSON.stringify(payload) });
    }
    if (kind === 'criativo') {
      if (data.id) {
        const current = telaoState.criativos.find((item) => item.id === data.id);
        const seconds = Number(data.seconds || 10);
        const payload = { ...data, ...formFlags(form) };
        if (current?.kind !== 'VIDEO') payload.duration_ms = Math.round(seconds * 1000);
        await api(`/telao/criativos/${data.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await uploadCriativo(form);
      }
    }
    if (kind === 'pagamento') {
      await api(`/telao/contratos/${data.contrato_id}/pagamentos`, { method: 'POST', body: JSON.stringify(data) });
      closeTelaoModal();
      return showPagamentos(data.contrato_id);
    }
    if (kind === 'nivel') {
      const apply = event.submitter?.value || 'brightness';
      await api('/telao/controle', { method: 'POST', body: JSON.stringify({ action: apply, value: Number(data[apply]) }) });
      tlError('');
      return;
    }
    if (kind === 'config') {
      const weekDays = [...form.querySelectorAll('[name="week_day"]:checked')].map((input) => input.value);
      await api('/telao/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          ...data,
          week_days: weekDays.join(','),
          institutional_fallback: Boolean(form.querySelector('[name="institutional_fallback"]')?.checked),
          contract_notices: Boolean(form.querySelector('[name="contract_notices"]')?.checked),
          auto_publish: Boolean(form.querySelector('[name="auto_publish"]')?.checked),
          width: Number(data.width),
          height: Number(data.height),
          default_duration_seconds: Number(data.default_duration_seconds),
          alert_after_minutes: Number(data.alert_after_minutes),
        }),
      });
      return loadTelaoView();
    }
    if (kind === 'relatorio') {
      const report = await api(`/telao/relatorio?from=${encodeURIComponent(data.from)}&to=${encodeURIComponent(data.to)}${data.cliente_id ? `&cliente_id=${encodeURIComponent(data.cliente_id)}` : ''}`);
      const rows = report.rows.map((row) => `<tr><td>${tlEsc(row.name)}</td><td>${tlEsc(row.cliente_name || '—')}</td><td>${row.insertions}</td><td>${row.seconds}s${row.approximate ? ' *' : ''}</td></tr>`).join('');
      document.getElementById('telao-relatorio').innerHTML = `<p>${tlEsc(report.note)}</p><table class="data-table"><thead><tr><th>Criativo</th><th>Cliente</th><th>Inserções</th><th>Tempo</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Sem exibições no período.</td></tr>'}</tbody></table>`;
      return;
    }
    closeTelaoModal();
    await loadTelaoView();
  } catch (err) {
    tlError(err.message || 'Não foi possível salvar.');
  }
}

async function showPagamentos(contratoId) {
  const data = await api(`/telao/contratos/${contratoId}/pagamentos`);
  const rows = data.pagamentos.map((item) => `
    <tr>
      <td>${tlDate(item.due_on)}</td><td>${tlMoney(item.amount)}</td><td>${tlBadge(item.status)}</td><td>${tlDate(item.paid_on)}</td>
      <td><button type="button" class="btn btn-ghost btn-sm" data-tl="baixar" data-id="${item.id}" data-contrato="${contratoId}">Marcar pago</button></td>
    </tr>`).join('');
  const box = document.getElementById('telao-pagamentos');
  if (!box) return;
  box.innerHTML = `
    <div class="tl-toolbar"><h3>Parcelas</h3><button type="button" class="btn btn-secondary btn-sm" data-tl="nova-parcela" data-id="${contratoId}">Nova parcela</button></div>
    <table class="data-table"><thead><tr><th>Vencimento</th><th>Valor</th><th>Status</th><th>Pago em</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5">Sem parcelas.</td></tr>'}</tbody></table>`;
}

async function onTelaoClick(event) {
  const button = event.target.closest('[data-tl]');
  if (!button) return;
  const action = button.dataset.tl;
  const id = button.dataset.id;
  tlError('');
  try {
    if (action.startsWith('wiz-')) return await onWizardAction(action, button);
    if (action === 'novo-cliente' || action === 'editar-cliente') {
      if (!telaoState.parceiros.length) telaoState.parceiros = (await api('/telao/parceiros')).parceiros;
      clienteForm(telaoState.clientes.find((item) => String(item.id) === String(id)) || {});
    }
    if (action === 'excluir-cliente' && window.confirm('Excluir este cliente?')) {
      await api(`/telao/clientes/${id}`, { method: 'DELETE' });
      await loadTelaoView();
    }
    if (action === 'novo-contrato' || action === 'editar-contrato') {
      contratoForm(telaoState.contratos.find((item) => String(item.id) === String(id)) || {});
    }
    if (action === 'pagamentos') await showPagamentos(id);
    if (action === 'nova-parcela') {
      tlModal(`<h3 id="telao-modal-title">Nova parcela</h3><form class="tl-form" data-tl-form="pagamento"><input type="hidden" name="contrato_id" value="${tlEsc(id)}" /><label>Vencimento<input type="date" name="due_on" required /></label><label>Valor<input name="amount" required /></label><button type="submit" class="btn btn-primary btn-sm">Salvar</button></form>`);
    }
    if (action === 'baixar') {
      await api(`/telao/pagamentos/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'pago' }) });
      await showPagamentos(button.dataset.contrato);
    }
    if (action === 'novo-criativo') criativoForm();
    if (action === 'editar-criativo') criativoForm(telaoState.criativos.find((item) => item.id === id));
    if (action === 'excluir-criativo' && window.confirm('Excluir este criativo da playlist?')) {
      await api(`/telao/criativos/${id}`, { method: 'DELETE' });
      await loadTelaoView();
    }
    if (action === 'publicar') {
      button.disabled = true;
      const result = await api('/telao/publicar', { method: 'POST', body: '{}' });
      button.disabled = false;
      if (!result.ok) throw new Error(result.error || 'A publicação falhou.');
      tlError('');
      window.alert(`Programação enviada com ${result.count} página(s). O player baixa o arquivo e só então troca a imagem.${result.hookWarning ? ` ${result.hookWarning}` : ''}`);
      if (telaoState.view === 'visao') await loadTelaoView();
    }
    if (action === 'status') {
      await api('/telao/status', { method: 'POST', body: '{}' });
      await loadTelaoView();
    }
    if (action === 'controle') {
      await api('/telao/controle', { method: 'POST', body: JSON.stringify({ action: button.dataset.action, value: button.dataset.value || null }) });
      if (button.dataset.action === 'capture') window.alert('Captura solicitada. A imagem aparece aqui quando o telão responder.');
    }
    if (action === 'armar-reboot') {
      if (!telaoState.rebootArmed) {
        telaoState.rebootArmed = true;
        button.textContent = 'Confirmar reinício';
        return;
      }
      telaoState.rebootArmed = false;
      await api('/telao/controle', { method: 'POST', body: JSON.stringify({ action: 'reboot' }) });
      window.alert('Reinício enviado ao player.');
    }
  } catch (err) {
    button.disabled = false;
    tlError(err.message || 'Não foi possível concluir a ação.');
  }
}

function onTelaoDragStart(event) {
  const card = event.target.closest('[data-creative]');
  if (!card) return;
  telaoState.dragId = card.dataset.creative;
}

function onTelaoDragOver(event) {
  if (event.target.closest('[data-creative]')) event.preventDefault();
}

async function onTelaoDrop(event) {
  const card = event.target.closest('[data-creative]');
  if (!card || !telaoState.dragId) return;
  event.preventDefault();
  const ids = telaoState.criativos.map((item) => item.id);
  const from = ids.indexOf(telaoState.dragId);
  const to = ids.indexOf(card.dataset.creative);
  telaoState.dragId = '';
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved);
  try {
    await api('/telao/criativos/ordem', { method: 'POST', body: JSON.stringify({ ids }) });
    await loadTelaoView();
  } catch (err) {
    tlError(err.message || 'Não foi possível reordenar.');
  }
}

function initTelaoAdmin() {
  document.getElementById('telao-subnav')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-telao-view]');
    if (!button) return;
    telaoState.view = button.dataset.telaoView;
    loadTelaoView();
  });
  document.getElementById('telao-refresh')?.addEventListener('click', () => loadTelaoView());
  const content = document.getElementById('telao-content');
  content?.addEventListener('click', onTelaoClick);
  content?.addEventListener('submit', onTelaoSubmit);
  content?.addEventListener('dragstart', onTelaoDragStart);
  content?.addEventListener('dragover', onTelaoDragOver);
  content?.addEventListener('drop', onTelaoDrop);
  const modal = document.getElementById('telao-modal');
  modal?.addEventListener('click', (event) => {
    if (event.target.closest('[data-tl-close]') || event.target.classList.contains('modal-backdrop')) closeTelaoModal();
  });
  modal?.addEventListener('submit', onTelaoSubmit);
}

function onTelaoTabOpen() {
  loadTelaoView();
}
