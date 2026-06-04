/**
 * Restaura CSS síncrono no <head> (media=print falha em alguns casos).
 * Uso: node scripts/fix-sync-css.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const STYLES_BLOCK =
  /<link rel="preload" href="styles\.css" as="style" \/>\s*<link rel="stylesheet" href="styles\.css" media="print" onload="this\.media='all'" \/>\s*<noscript><link rel="stylesheet" href="styles\.css" \/><\/noscript>/g;

const PAGE_BLOCK =
  /<link rel="preload" href="(css\/pages\/[^"]+\.css)" as="style" \/>\s*<link rel="stylesheet" href="\1" media="print" onload="this\.media='all'" \/>\s*<noscript><link rel="stylesheet" href="\1" \/><\/noscript>/g;

for (const name of readdirSync(root).filter((n) => n.endsWith('.html'))) {
  const path = join(root, name);
  let html = readFileSync(path, 'utf8');
  const next = html
    .replace(STYLES_BLOCK, '<link rel="stylesheet" href="styles.css" />')
    .replace(PAGE_BLOCK, '<link rel="stylesheet" href="$1" />');
  if (next !== html) {
    writeFileSync(path, next, 'utf8');
    console.log('fixed', name);
  }
}
