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
      'Procurando a melhor academia em Irecê, BA? Musculação, cardio e avaliação física com estrutura moderna. Antonov Center — projetado para decolar.',
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
        closes: '23:00',
      },
    ],
    areaServed: b.areaServed.map((name) => ({ '@type': 'City', name })),
    sameAs: [b.instagram, b.mapsUrl].filter(Boolean),
    ...(b.priceRange ? { priceRange: b.priceRange } : {}),
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

  const faqPlanos = [
    {
      name: 'O que é a Antonov Center?',
      text: 'Academia de performance em Irecê, Bahia, com hangar de cerca de 3.000 m², musculação, cardio e avaliação física.',
    },
    {
      name: 'Quais planos a Antonov Center oferece?',
      text: 'First Class (mensalidade) e Diária (avulso ou pacotes). Preços em /planos.',
    },
    {
      name: 'Quanto custa o plano First Class?',
      text: 'R$ 189,90/mês no mensal ou R$ 169,90/mês no anual (−8%). Inclui hangar 05:00–23:00 e avaliação física grátis.',
    },
    {
      name: 'Como funciona a diária na Antonov?',
      text: '1 diária R$ 50; 3 diárias R$ 110; 10 diárias R$ 300 (validade 6 meses).',
    },
    {
      name: 'Qual o horário da Antonov Center em Irecê?',
      text: 'Segunda a domingo, 05:00 às 23:00 (horário de Brasília).',
    },
    {
      name: 'O que está incluso na mensalidade?',
      text: 'Cada plano inclui acesso a tudo que a ANTONOV tem a oferecer, alterando somente o horário de acesso.',
    },
    {
      name: 'Posso conhecer a academia antes de assinar?',
      text: 'Sim. Fale conosco pelo link de contato para conhecer a estrutura e escolher o plano ideal. Sem compromisso.',
    },
    {
      name: 'Tem fidelidade ou multa de cancelamento?',
      text: 'Planos mensais e diários sem fidelidade. Plano anual: desconto de 8% com fidelidade de 12 meses e cobrança recorrente.',
    },
    {
      name: 'Preciso seguir um programa específico?',
      text: 'Não obrigatoriamente. Treino livre no Hangar; avaliação inicial e rotina sugerida disponíveis.',
    },
    {
      name: 'Onde fica a Antonov Center em Irecê?',
      text: 'Av. 1º de Janeiro, Irecê, BA, CEP 44860-201. Mapa em /contato#mapa.',
    },
    {
      name: 'Como falar com a Antonov em Irecê?',
      text: 'Formulário em /contato, WhatsApp +55 74 99963-1507 ou antonovacademia@gmail.com.',
    },
  ];

  function faqSchema(questions) {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: questions.map((q) => ({
        '@type': 'Question',
        name: q.name,
        acceptedAnswer: { '@type': 'Answer', text: q.text },
      })),
    };
  }

  if (page === 'home' && isHome) {
    inject(
      faqSchema([
        faqPlanos[0],
        faqPlanos[1],
        faqPlanos[4],
        faqPlanos[9],
        faqPlanos[10],
      ])
    );
  }

  if (page === 'planos') {
    inject(faqSchema(faqPlanos));
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
