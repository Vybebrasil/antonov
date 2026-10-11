import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const NAV_BLOCK = `    <nav class="nav__links" aria-label="Principal">
      <a href="/">Home</a>
      <a href="/sobre">Sobre</a>
      <a href="/planos">Planos</a>
      <a href="/parceiros">Parceiros</a>
      <a href="/contato">Contato</a>
    </nav>`;

const NAV_ACTIVE = (active) => `    <nav class="nav__links" aria-label="Principal">
      <a href="/"${active === 'home' ? ' class="active"' : ''}>Home</a>
      <a href="/sobre"${active === 'sobre' ? ' class="active"' : ''}>Sobre</a>
      <a href="/planos"${active === 'planos' ? ' class="active"' : ''}>Planos</a>
      <a href="/parceiros"${active === 'parceiros' ? ' class="active"' : ''}>Parceiros</a>
      <a href="/contato"${active === 'contato' ? ' class="active"' : ''}>Contato</a>
    </nav>`;

const ACTIVE_MAP = {
  'index.html': 'home',
  'home.html': 'home',
  'sobre.html': 'sobre',
  'planos.html': 'planos',
  'parceiros.html': 'parceiros',
  'parceiros-perfil.html': 'parceiros',
  'contato.html': 'contato',
  'trabalhe-conosco.html': 'contato',
};

for (const name of readdirSync(root).filter((n) => n.endsWith('.html'))) {
  const path = join(root, name);
  let html = readFileSync(path, 'utf8');
  if (!html.includes('nav__links')) continue;
  const active = ACTIVE_MAP[name] || '';
  html = html.replace(/<nav class="nav__links" aria-label="Principal">[\s\S]*?<\/nav>/, NAV_ACTIVE(active));
  if (html.includes('<h3 class="footer__col-title">Navegação</h3>') && !html.includes('href="/parceiros"')) {
    html = html.replace(
      /(<li><a href="\/planos">Planos<\/a><\/li>\s*)/,
      '$1            <li><a href="/parceiros">Parceiros</a></li>\n            '
    );
  }
  writeFileSync(path, html, 'utf8');
  console.log('nav', name);
}
