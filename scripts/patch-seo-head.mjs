import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const config = JSON.parse(readFileSync(join(__dirname, 'seo-pages.json'), 'utf8'));

function seoBlock(page) {
  const url = config.siteUrl + (page.path === '/' ? '' : page.path);
  const canonical = page.path === '/' ? config.siteUrl + '/' : url;
  const t = page.title.replace(/"/g, '&quot;');
  const d = page.description.replace(/"/g, '&quot;');
  return `<title>${page.title}</title>
<meta name="description" content="${page.description}" />
<meta name="robots" content="index, follow" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="pt_BR" />
<meta property="og:site_name" content="Antonov Center" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${config.image}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${config.image}" />`;
}

function patchFile(filePath, page) {
  let html = readFileSync(filePath, 'utf8');
  const block = seoBlock(page);

  html = html.replace(/<title>[\s\S]*?<\/title>\s*/i, '');
  html = html.replace(/<meta name="description"[^>]*>\s*/gi, '');
  html = html.replace(
    /(<link rel="manifest" href="\/assets\/site\.webmanifest" \/>)\s*/i,
    `$1\n${block}\n`
  );

  if (!html.includes('data-seo-page')) {
    html = html.replace(/<body([^>]*)>/i, `<body$1 data-seo-page="${page.seoPage}">`);
  } else {
    html = html.replace(/data-seo-page="[^"]*"/i, `data-seo-page="${page.seoPage}"`);
  }

  if (!html.includes('seo-config.js')) {
    html = html.replace(
      /(<link rel="stylesheet" href="styles\.css" \/>)/i,
      `$1\n<script src="seo-config.js"></script>\n<script src="seo-schema.js"></script>`
    );
  }

  writeFileSync(filePath, html, 'utf8');
  console.log('patched', filePath);
}

for (const [file, page] of Object.entries(config.pages)) {
  patchFile(join(root, file), page);
  const mirror = join(root, 'Antonov', file);
  try {
    patchFile(mirror, page);
  } catch {
    /* mirror opcional */
  }
}
