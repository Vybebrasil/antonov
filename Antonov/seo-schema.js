/* JSON-LD — LocalBusiness, WebSite, BreadcrumbList, FAQPage, ContactPage */
(function () {
  'use strict';

  const cfg = window.ANTONOV_SEO;
  if (!cfg) return;

  const b = cfg.business;
  const base = cfg.siteUrl.replace(/\/$/, '');
  const image = base + cfg.defaultImage;
  const page = document.body.dataset.seoPage || '';

  const address = {
    '@type': 'PostalAddress',
    streetAddress: b.street,
    addressLocality: b.city,
    addressRegion: b.region,
    addressCountry: b.country,
  };
  if (b.postalCode) address.postalCode = b.postalCode;

  const localBusinessId = base + '/#localbusiness';

  const localBusiness = {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    '@id': localBusinessId,
    name: b.name,
    ...(b.legalName ? { legalName: b.legalName } : {}),
    ...(b.taxID ? { taxID: b.taxID } : {}),
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
    page === 'home' ||
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

  const breadcrumbLabels = {
    home: 'Home',
    planos: 'Planos',
    contato: 'Contato',
    aulas: 'Aulas',
    estudio: 'Estúdio',
    sobre: 'Sobre',
    trabalhe: 'Trabalhe conosco',
    termos: 'Termos de uso',
    privacidade: 'Privacidade',
    cookies: 'Cookies',
  };

  const breadcrumbPaths = {
    home: '/',
    planos: '/planos',
    contato: '/contato',
    aulas: '/aulas',
    estudio: '/estudio',
    sobre: '/sobre',
    trabalhe: '/trabalhe-conosco',
    termos: '/termos',
    privacidade: '/privacidade',
    cookies: '/cookies',
  };

  if (page && page !== 'home' && breadcrumbLabels[page]) {
    inject({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: base + '/',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: breadcrumbLabels[page],
          item: base + breadcrumbPaths[page],
        },
      ],
    });
  }

  if (page === 'planos') {
    inject({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'O que está incluso na mensalidade?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Cada plano inclui acesso a tudo que a ANTONOV tem a oferecer, alterando somente o horário de acesso.',
          },
        },
        {
          '@type': 'Question',
          name: 'Posso conhecer a academia antes de assinar?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Sim. Fale conosco pelo link de contato para conhecer a estrutura e escolher o plano ideal. Sem compromisso.',
          },
        },
        {
          '@type': 'Question',
          name: 'Tem fidelidade ou multa de cancelamento?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Depende do plano. Os planos mensais e diários não têm fidelidade. O plano anual tem desconto de 8% com fidelidade de 12 meses e cobrança recorrente.',
          },
        },
        {
          '@type': 'Question',
          name: 'Preciso seguir um programa específico?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Não obrigatoriamente. Você pode treinar livre no Hangar. Todo membro tem acesso a uma avaliação inicial e uma rotina sugerida.',
          },
        },
        {
          '@type': 'Question',
          name: 'Onde fica a Antonov Center em Irecê?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Na Av. 1º de Janeiro, Irecê, Bahia. Veja o mapa em /contato#mapa.',
          },
        },
        {
          '@type': 'Question',
          name: 'Como falar com a Antonov em Irecê?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Pelo formulário em /contato, WhatsApp +55 74 99963-1507 ou e-mail antonovacademia@gmail.com. Sem compromisso.',
          },
        },
      ],
    });
  }

  if (page === 'contato') {
    inject({
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: 'Contato — Antonov Center',
      url: base + '/contato',
      about: { '@id': localBusinessId },
      mainEntity: { '@id': localBusinessId },
    });
  }
})();
