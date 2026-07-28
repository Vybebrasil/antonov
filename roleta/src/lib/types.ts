export type Prize = {
  id: string
  name: string
  slug: string
  weight: number
  stock: number | null
  active: boolean
  sort_order: number
  color: string
  instruction: string
  /** 1 a cada N giros (chance sobe até 100% no N-ésimo). null = só peso clássico */
  pity_every: number | null
  /** Giros desde o último drop deste prêmio */
  pity_counter: number
}

export type Lead = {
  id: string
  name: string
  whatsapp: string
  created_at: string
}

export type Spin = {
  id: string
  lead_id: string
  prize_id: string
  created_at: string
  device_id: string | null
  prize?: Prize
  lead?: Lead
}

export type AdminSettings = {
  id: number
  whatsapp_cooldown_hours: number
  result_timeout_seconds: number
  allow_repeat_spin: boolean
}

export const DEFAULT_PRIZES: Prize[] = [
  {
    id: 'mock-1',
    name: 'Copo',
    slug: 'copo',
    weight: 10,
    stock: 50,
    active: true,
    sort_order: 1,
    color: '#FFC20E',
    instruction: 'Retire seu prêmio no balcão da Antonov.',
    pity_every: 10,
    pity_counter: 0,
  },
  {
    id: 'mock-2',
    name: 'Boné',
    slug: 'bone',
    weight: 8,
    stock: 30,
    active: true,
    sort_order: 2,
    color: '#009CDE',
    instruction: 'Retire seu prêmio no balcão da Antonov.',
    pity_every: 12,
    pity_counter: 0,
  },
  {
    id: 'mock-3',
    name: 'Coqueteleira',
    slug: 'coqueteleira',
    weight: 6,
    stock: 20,
    active: true,
    sort_order: 3,
    color: '#FFC20E',
    instruction: 'Retire seu prêmio no balcão da Antonov.',
    pity_every: 16,
    pity_counter: 0,
  },
  {
    id: 'mock-4',
    name: '20% off matrícula + 20% off 1ª mensalidade Holística',
    slug: 'desconto-holistica',
    weight: 8,
    stock: null,
    active: true,
    sort_order: 4,
    color: '#009CDE',
    instruction: 'Apresente este comprovante na Holística para resgatar o desconto.',
    pity_every: 12,
    pity_counter: 0,
  },
  {
    id: 'mock-5',
    name: 'Instalação + 1 mês grátis de internet',
    slug: 'internet-gratis',
    weight: 8,
    stock: null,
    active: true,
    sort_order: 5,
    color: '#FFC20E',
    instruction: 'Fale com a equipe Antonov para ativar sua promoção.',
    pity_every: 12,
    pity_counter: 0,
  },
  {
    id: 'mock-6',
    name: '1 mês grátis na academia',
    slug: 'academia-gratis',
    weight: 8,
    stock: null,
    active: true,
    sort_order: 6,
    color: '#009CDE',
    instruction: 'Apresente este comprovante na academia parceira.',
    pity_every: 12,
    pity_counter: 0,
  },
]

export const DEFAULT_SETTINGS: AdminSettings = {
  id: 1,
  whatsapp_cooldown_hours: 24,
  result_timeout_seconds: 15,
  allow_repeat_spin: false,
}
