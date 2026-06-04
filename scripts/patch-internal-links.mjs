import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const LINK_MAP = {
  'index.html': '/',
  'planos.html': '/planos',
  'contato.html': '/contato',
  'aulas.html': '/aulas',
  'estudio.html': '/estudio',
  'sobre.html': '/sobre',
  'trabalhe-conosco.html': '/trabalhe-conosco',
  'termos.html': '/termos',
  'privacidade.html': '/privacidade',
  'cookies.html': '/cookies',
};

const NAV_ITEMS = [
  { key: 'home', href: '/', label: 'Home' },
  { key: 'planos', href: '/planos', label: 'Planos' },
  { key: 'contato', href: '/contato', label: 'Contato' },
];

function navHtml(activeKey) {
  const links = NAV_ITEMS.map(
    (item) =>
      `<a href="${item.href}"${item.key === activeKey ? ' class="active"' : ''}>${item.label}</a>`
  ).join('\n      ');
  return `    <nav class="nav__links" aria-label="Principal">
      ${links}
    </nav>`;
}

const FOOTER_NAV = `          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/planos">Planos</a></li>
            <li><a href="/contato">Contato</a></li>
            <li><a href="/trabalhe-conosco">Trabalhe conosco</a></li>
          </ul>`;

function fileToActiveKey(filename) {
  const entry = Object.entries(LINK_MAP).find(([f]) => f === filename);
  if (!entry) return null;
  const path = entry[1];
  if (path === '/') return 'home';
  return path.slice(1);
}

function replaceHtmlLinks(html) {
  for (const [file, path] of Object.entries(LINK_MAP)) {
    const re = new RegExp(`href="${file.replace('.', '\\.')}"`, 'g');
    html = html.replace(re, `href="${path}"`);
  }
  html = html.replace(/href="index\.html"/g, 'href="/"');
  return html;
}

function patchNav(html, activeKey) {
  return html.replace(
    /<nav class="nav__links" aria-label="Principal">[\s\S]*?<\/nav>/,
    navHtml(activeKey)
  );
}

function patchFooterNav(html) {
  return html.replace(
    /<h3 class="footer__col-title">Navegação<\/h3>\s*<ul>[\s\S]*?<\/ul>/,
    `<h3 class="footer__col-title">Navegação</h3>\n          ${FOOTER_NAV.trim()}`
  );
}

function patchFile(filePath) {
  const filename = filePath.split(/[/\\]/).pop();
  const activeKey = fileToActiveKey(filename);
  if (!activeKey) return;

  let html = readFileSync(filePath, 'utf8');
  html = replaceHtmlLinks(html);
  html = patchNav(html, activeKey);
  if (html.includes('<h3 class="footer__col-title">Navegação</h3>')) {
    html = patchFooterNav(html);
  }
  writeFileSync(filePath, html, 'utf8');
  console.log('links', filePath);
}

function processDir(dir) {
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.html')) continue;
    patchFile(join(dir, name));
  }
}

processDir(root);
if (existsSync(join(root, 'Antonov'))) processDir(join(root, 'Antonov'));
