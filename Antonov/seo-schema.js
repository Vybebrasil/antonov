/* JSON-LD — SportsActivityLocation + WebSite na home */
(function () {
  'use strict';

  const cfg = window.ANTONOV_SEO;
  if (!cfg) return;

  const b = cfg.business;
  const base = cfg.siteUrl.replace(/\/$/, '');
  const image = base + cfg.defaultImage;

  const address = {
    '@type': 'PostalAddress',
    streetAddress: b.street,
    addressLocality: b.city,
    addressRegion: b.region,
    addressCountry: b.country,
  };
  if (b.postalCode) address.postalCode = b.postalCode;

  const localBusiness = {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: b.name,
    description:
      'Academia de performance em Irecê, Bahia. Treino, musculação, cardio e estrutura premium.',
    url: base,
    image,
    telephone: b.phone,
    email: b.email,
    address,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: b.lat,
      longitude: b.lng,
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ],
        opens: '05:00',
        closes: '24:00',
      },
    ],
    areaServed: b.areaServed.map((name) => ({ '@type': 'City', name })),
    sameAs: [b.instagram, b.mapsUrl].filter(Boolean),
  };

  function inject(data) {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = JSON.stringify(data);
    document.head.appendChild(el);
  }

  inject(localBusiness);

  const isHome =
    document.body.dataset.seoPage === 'home' ||
    location.pathname === '/' ||
    /index\.html$/i.test(location.pathname);

  if (isHome) {
    inject({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: cfg.siteName,
      url: base,
      inLanguage: 'pt-BR',
      publisher: { '@type': 'Organization', name: b.name, url: base },
    });
  }
})();
