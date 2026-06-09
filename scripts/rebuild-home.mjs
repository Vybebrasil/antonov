import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = fs.readFileSync(join(root, 'index.html.restored'), 'utf8');

const navOld = `    <a href="/planos" class="btn btn--yellow nav__cta">Comece agora <span class="arrow"></span></a>
    <button type="button" class="nav__burger" aria-label="Abrir menu" aria-expanded="false" aria-controls="nav-drawer"><span></span><span></span><span></span></button>
  </div>
  <div class="nav__backdrop" aria-hidden="true"></div>
  <aside id="nav-drawer" class="nav__drawer" aria-hidden="true" aria-label="Menu de navegação">
    <div class="nav__drawer-links" role="navigation"></div>
    <a href="/planos" class="btn btn--yellow nav__drawer-cta">Comece agora <span class="arrow"></span></a>
  </aside>`;

const navNew = `    <div class="nav__actions">
      <div class="nav__stores" aria-label="Baixar app FITI">
        <a href="https://apps.apple.com/br/app/fiti/id1452917007" class="nav__store nav__store--apple" target="_blank" rel="noopener noreferrer" aria-label="Baixar na App Store">
          <img src="assets/badge-app-store.png" alt="Disponível na App Store" width="118" height="34" decoding="async">
        </a>
        <a href="https://play.google.com/store/apps/details?id=br.com.w12.evobeta&amp;pli=1" class="nav__store nav__store--play" target="_blank" rel="noopener noreferrer" aria-label="Baixar no Google Play">
          <img src="assets/badge-google-play.png" alt="Disponível no Google Play" width="118" height="34" decoding="async">
        </a>
      </div>
      <a href="/planos" class="btn btn--yellow nav__cta">Comece agora <span class="arrow"></span></a>
    </div>
    <button type="button" class="nav__burger" aria-label="Abrir menu" aria-expanded="false" aria-controls="nav-drawer"><span></span><span></span><span></span></button>
  </div>
  <div class="nav__backdrop" aria-hidden="true"></div>
  <aside id="nav-drawer" class="nav__drawer" aria-hidden="true" aria-label="Menu de navegação">
    <div class="nav__drawer-links" role="navigation"></div>
    <div class="nav__drawer-stores" aria-label="Baixar app FITI">
      <a href="https://apps.apple.com/br/app/fiti/id1452917007" class="nav__store nav__store--apple" target="_blank" rel="noopener noreferrer" aria-label="Baixar na App Store">
        <img src="assets/badge-app-store.png" alt="Disponível na App Store" width="118" height="34" decoding="async">
      </a>
      <a href="https://play.google.com/store/apps/details?id=br.com.w12.evobeta&amp;pli=1" class="nav__store nav__store--play" target="_blank" rel="noopener noreferrer" aria-label="Baixar no Google Play">
        <img src="assets/badge-google-play.png" alt="Disponível no Google Play" width="118" height="34" decoding="async">
      </a>
    </div>
    <a href="/planos" class="btn btn--yellow nav__drawer-cta">Comece agora <span class="arrow"></span></a>
  </aside>`;

if (!html.includes('nav__cta')) throw new Error('nav block not found');
html = html.replace(navOld, navNew);

const fiti = `
<!-- ============= APP DO ALUNO (FITI) ============= -->
<section class="home-app" id="app-aluno" data-screen-label="07 App FITI" aria-labelledby="home-app-title">
  <div class="home-app__inner">
    <div class="home-app__intro reveal">
      <img src="assets/fiti-app-icon.png" alt="Ícone do aplicativo FITI" class="home-app__icon" width="96" height="96" loading="lazy" decoding="async" />
      <p class="home-app__lbl">/ APP DO ALUNO</p>
      <h2 id="home-app-title">Baixe o <span class="home-app__brand">FITI</span></h2>
      <p class="home-app__lede">O app oficial para acompanhar treinos, agenda e planos na Antonov Center. Tudo na palma da mão, com segurança e praticidade.</p>
      <div class="home-app__stores">
        <a href="https://apps.apple.com/br/app/fiti/id1452917007" class="home-app__store home-app__store--apple" target="_blank" rel="noopener noreferrer">
          <img src="assets/badge-app-store.png" alt="Disponível na App Store" width="180" height="54" loading="lazy" decoding="async">
        </a>
        <a href="https://play.google.com/store/apps/details?id=br.com.w12.evobeta&amp;pli=1" class="home-app__store home-app__store--play" target="_blank" rel="noopener noreferrer">
          <img src="assets/badge-google-play.png" alt="Disponível no Google Play" width="180" height="54" loading="lazy" decoding="async">
        </a>
      </div>
    </div>
  </div>
</section>

`;

const faqMarker = '<!-- ============= FAQ (resumo) ============= -->';
if (!html.includes(faqMarker)) throw new Error('FAQ marker not found');
html = html.replace(faqMarker, fiti + faqMarker);

fs.writeFileSync(join(root, 'home.html'), html, 'utf8');
console.log('home.html OK — Irecê:', html.includes('Irecê'), 'sem U+FFFD:', !html.includes('\uFFFD'));
