/**
 * Gera variantes WebP/PNG redimensionadas (logo, wireframe) para PageSpeed.
 * Uso: node scripts/optimize-images.mjs
 */
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');

const JOBS = [
  {
    src: 'logo.png',
    variants: [
      { name: 'logo.webp', width: 422, webp: { quality: 76, effort: 6 } },
      { name: 'logo-211.webp', width: 211, webp: { quality: 74, effort: 6 } },
      { name: 'logo-422.png', width: 422, png: { compressionLevel: 9, palette: true } },
      { name: 'logo-211.png', width: 211, png: { compressionLevel: 9, palette: true } },
    ],
  },
  {
    src: 'logo-preta.png',
    variants: [
      { name: 'logo-preta.webp', width: 506, webp: { quality: 76, effort: 6 } },
      { name: 'logo-preta-253.webp', width: 253, webp: { quality: 74, effort: 6 } },
      { name: 'logo-preta-506.png', width: 506, png: { compressionLevel: 9, palette: true } },
      { name: 'logo-preta-253.png', width: 253, png: { compressionLevel: 9, palette: true } },
    ],
  },
  {
    src: 'wireframe-side.png',
    variants: [
      { name: 'wireframe-side.webp', width: 937, webp: { quality: 78, effort: 6 } },
      { name: 'wireframe-side-640.webp', width: 640, webp: { quality: 76, effort: 6 } },
      { name: 'wireframe-side-937.png', width: 937, png: { compressionLevel: 9 } },
    ],
  },
];

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('sharp não instalado — rode: npm install');
    process.exit(1);
  }

  for (const job of JOBS) {
    const srcPath = join(assetsDir, job.src);
    if (!existsSync(srcPath)) {
      console.warn('skip (ausente)', job.src);
      continue;
    }
    for (const v of job.variants) {
      const dest = join(assetsDir, v.name);
      let pipe = sharp(srcPath).resize({
        width: v.width,
        withoutEnlargement: true,
        fit: 'inside',
      });
      if (v.webp) {
        await pipe.webp(v.webp).toFile(dest);
      } else {
        await pipe.png(v.png).toFile(dest);
      }
      console.log('ok', v.name);
    }
  }
}

main();
