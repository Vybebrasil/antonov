import { existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const assetsDir = join(root, 'assets');

const TARGETS = [
  'foto-hero.png',
  'disc-01-barbells.png',
  'disc-02.png',
  'disc-03-treadmills.png',
  'fotogeral.png',
  'space-hightech.png',
  'purpose-bg.png',
  'wireframe-side.png',
  'logo.png',
  'logo-preta.png',
];

async function main() {
  if (!existsSync(assetsDir)) {
    console.log('pasta assets/ ausente — WebP ignorado');
    return;
  }

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('sharp não instalado — rode: npm install --save-dev sharp');
    return;
  }

  let count = 0;
  for (const file of TARGETS) {
    const src = join(assetsDir, file);
    if (!existsSync(src)) continue;
    const dest = join(assetsDir, file.replace(/\.png$/i, '.webp'));
    await sharp(src).webp({ quality: 82 }).toFile(dest);
    console.log('webp', basename(dest));
    count++;
  }

  if (count === 0) {
    console.log('nenhum PNG em assets/ — CSS já usa fallback PNG');
  } else {
    console.log(`${count} imagens convertidas`);
  }
}

main();
