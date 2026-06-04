import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'planos.html');
let html = readFileSync(path, 'utf8');
const pairs = [
  ['â€"', '—'],
  ['â€¦', '…'],
  ['�??', '—'],
  ['Preparando hangar�?�', 'Preparando hangar…'],
  ['AVALIA�?�?O', 'AVALIAÇÃO'],
  ['OPERA�?�?O', 'OPERAÇÃO'],
  ['Ãª', 'ê'],
  ['Ã¡', 'á'],
  ['Ã§', 'ç'],
  ['Ã­', 'í'],
  ['Ã³', 'ó'],
  ['Ã£', 'ã'],
  ['Ã©', 'é'],
  ['Ãº', 'ú'],
  ['Ãµ', 'õ'],
  ['ï¿½', '…'],
];
for (const [from, to] of pairs) html = html.split(from).join(to);
writeFileSync(path, html, 'utf8');
console.log('ok planos.html', html.includes('Irecê') ? 'Irecê ok' : 'check encoding');
