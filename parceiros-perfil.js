(function () {
  'use strict';

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getSlug() {
    const params = new URLSearchParams(location.search);
    if (params.get('slug')) return params.get('slug');
    const parts = location.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('parceiros');
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    return '';
  }

  function injectSchema(partner) {
    const cfg = window.ANTONOV_SEO;
    if (!cfg || !partner) return;
    const base = cfg.siteUrl.replace(/\/$/, '');
    const type = partner.profession?.toLowerCase().includes('clínica') ? 'LocalBusiness' : 'Person';
    const data = {
      '@context': 'https://schema.org',
      '@type': type,
      name: partner.name.replace(/\s*\(demo\)\s*/i, '').trim(),
      description: partner.short_description || partner.full_description,
      url: `${base}/parceiros/${partner.slug}`,
      image: partner.photo_url ? `${base}${partner.photo_url}` : undefined,
      jobTitle: partner.profession || undefined,
    };
    if (partner.location) {
      data.address = {
        '@type': 'PostalAddress',
        streetAddress: partner.location.address || undefined,
        addressLocality: partner.location.city || undefined,
        addressRegion: partner.location.state || undefined,
        postalCode: partner.location.postal_code || undefined,
        addressCountry: 'BR',
      };
    }
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = JSON.stringify(data);
    document.head.appendChild(el);
  }

  function setMeta(partner) {
    const title = `${partner.name.replace(/\s*\(demo\)\s*/i, '').trim()} | Parceiros Antonov`;
    document.title = title;
    const desc = partner.short_description || partner.full_description || 'Profissional do ecossistema Antonov Center.';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = desc;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `https://www.antonovcenter.com.br/parceiros/${partner.slug}`;
  }

  function render(partner) {
    const root = document.getElementById('partner-profile');
    if (!root) return;
    const services = (partner.services || []).slice(0, 6);
    const ctas = [];
    const go = window.AntonovPartners?.goUrl
      ? (channel) => window.AntonovPartners.goUrl(partner.slug, channel)
      : (channel) => `/go/${encodeURIComponent(partner.slug)}/${channel}`;
    if (partner.has_whatsapp) {
      ctas.push(`<a class="btn btn--yellow" href="${esc(go('whatsapp'))}">Falar no WhatsApp <span class="arrow"></span></a>`);
    }
    if (partner.has_instagram) {
      ctas.push(`<a class="btn btn--ghost" href="${esc(go('instagram'))}">Instagram</a>`);
    }
    if (partner.has_maps) {
      ctas.push(`<a class="btn btn--ghost" href="${esc(go('maps'))}">Como chegar</a>`);
    }

    root.innerHTML = `
      <section class="partner-profile-hero">
        <div class="partner-profile-hero__inner">
          <div class="partner-profile-hero__media-wrap">
            <div class="partner-profile-hero__photo">
              ${partner.photo_url
                ? `<img src="${esc(partner.photo_url)}" alt="${esc(partner.name)}" loading="eager" decoding="async" />`
                : `<span class="partner-card__placeholder" aria-hidden="true">${esc(partner.name.slice(0, 1))}</span>`}
            </div>
            ${partner.logo_url ? `<img class="partner-profile-hero__logo" src="${esc(partner.logo_url)}" alt="" loading="lazy" />` : ''}
          </div>
          <div>
            <p class="partner-profile-hero__crumb">/ PARCEIRO · ${esc(partner.category?.name || 'ECOSSISTEMA')}</p>
            <h1>${esc(partner.name)}</h1>
            <div class="partner-profile-hero__meta">
              <span class="v">${esc(partner.profession || partner.category?.name || '')}</span>
              ${partner.specialty ? `<span>${esc(partner.specialty)}</span>` : ''}
              ${partner.registry ? `<span>Registro ${esc(partner.registry)}</span>` : ''}
            </div>
            <p class="partner-profile-hero__desc">${esc(partner.short_description || '')}</p>
            <div class="partner-profile-hero__actions">${ctas.join('')}</div>
          </div>
        </div>
      </section>

      <section class="partner-section">
        <div class="partner-section__inner">
          <p class="partner-section__label">/ SOBRE</p>
          <h2>Quem acompanha sua performance.</h2>
          <p>${esc(partner.full_description || partner.short_description || '')}</p>
        </div>
      </section>

      ${services.length ? `
      <section class="partner-section">
        <div class="partner-section__inner">
          <p class="partner-section__label">/ SERVIÇOS · ESPECIALIDADES</p>
          <h2>Atuação principal.</h2>
          <ul class="partner-services">
            ${services.map((s, i) => `
              <li>
                <span class="partner-services__no">${String(i + 1).padStart(2, '0')}</span>
                <span>${esc(s.name)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      </section>` : ''}

      ${partner.location ? `
      <section class="partner-section">
        <div class="partner-section__inner">
          <p class="partner-section__label">/ LOCALIZAÇÃO</p>
          <h2>Atendimento presencial.</h2>
          <div class="partner-location">
            ${partner.location.venue_name ? `<strong>${esc(partner.location.venue_name)}</strong>` : ''}
            <div>${esc(partner.location.address || '')}${partner.location.address_complement ? `, ${esc(partner.location.address_complement)}` : ''}</div>
            <div>${esc([partner.location.neighborhood, partner.location.city, partner.location.state].filter(Boolean).join(' · '))}</div>
            <a class="btn btn--ghost" href="${esc(go('maps'))}">Abrir no Google Maps <span class="arrow"></span></a>
          </div>
        </div>
      </section>` : ''}
    `;

    injectSchema(partner);
    setMeta(partner);
    window.AntonovPartners?.track('partner_profile_view', {
      partner_id: partner.id,
      category_id: partner.category?.id || null,
      metadata: { slug: partner.slug, category_slug: partner.category?.slug || null },
    });
  }

  async function load() {
    const slug = getSlug();
    const root = document.getElementById('partner-profile');
    if (!slug || !root) return;
    try {
      const res = await fetch(`/api/partners/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '404');
      render(data.partner);
    } catch {
      root.innerHTML = `
        <section class="partners-empty" style="margin: calc(var(--nav-h) + 80px) auto 120px;">
          <h2>Parceiro não encontrado</h2>
          <p>Este perfil não está disponível no momento.</p>
          <p style="margin-top:20px;"><a class="btn btn--yellow" href="/parceiros">Ver todos os parceiros <span class="arrow"></span></a></p>
        </section>
      `;
    }
  }

  if (document.body.dataset.page === 'parceiros-perfil') load();
})();
