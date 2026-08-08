/**
 * Unidades Matriz — lista obrigatória fornecida pelo negócio.
 * Todas devem aparecer no painel mesmo com 0 vendas.
 *
 * Regra especial "Américas": o marketplace da unidade Américas está cadastrado
 * dentro da comunidade/arquivo de Rocha Miranda na plataforma Layers. A
 * separação NÃO é feita pelo nome do arquivo de origem, e sim pelo campo
 * "Nome do Canal" de cada linha (ex.: "Bolsão 2027 - Américas" vs
 * "Bolsão 2027 - Rocha Miranda") — ver `identifyUnit` em normalize.ts.
 */
export interface UnitDef {
  slug: string;
  nome: string;
  /** fragmentos (sem acento, minúsculo) usados para casar com "Nome do Canal" */
  aliases: string[];
}

export const UNITS: UnitDef[] = [
  { slug: "americas", nome: "Américas", aliases: ["americas", "america"] },
  { slug: "bangu", nome: "Bangu", aliases: ["bangu"] },
  { slug: "campo-grande", nome: "Campo Grande", aliases: ["campo grande"] },
  {
    slug: "duque-de-caxias",
    nome: "Duque de Caxias",
    aliases: ["duque de caxias", "caxias"],
  },
  { slug: "madureira", nome: "Madureira", aliases: ["madureira"] },
  {
    slug: "nova-iguacu",
    nome: "Nova Iguaçu",
    aliases: ["nova iguacu", "nova iguaçu", "iguacu"],
  },
  {
    slug: "retiro-dos-artistas",
    nome: "Retiro dos Artistas",
    aliases: ["retiro dos artistas", "retiro"],
  },
  {
    slug: "rocha-miranda",
    nome: "Rocha Miranda",
    aliases: ["rocha miranda"],
  },
  {
    slug: "sao-joao-de-meriti",
    nome: "São João de Meriti",
    aliases: ["sao joao de meriti", "s jo de meriti", "meriti"],
  },
  { slug: "taquara", nome: "Taquara", aliases: ["taquara"] },
  { slug: "tijuca", nome: "Tijuca", aliases: ["tijuca"] },
];

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function unitBySlug(slug: string): UnitDef | undefined {
  return UNITS.find((u) => u.slug === slug);
}

/**
 * Identifica a unidade a partir do texto de "Nome do Canal" (ex.:
 * "Bolsão 2027 - Rocha Miranda", "Bolsão 2026 - Caxias"). Casamento por
 * substring, ignorando acentos/caixa e o prefixo "Bolsão <ano> -".
 *
 * IMPORTANTE: a checagem de "americas" ocorre antes das demais para que,
 * mesmo dentro do arquivo de origem "Rocha Miranda_...csv", uma linha cujo
 * canal mencione Américas seja corretamente separada.
 */
export function identifyUnitByChannel(canalRaw: string | undefined | null): UnitDef | null {
  if (!canalRaw) return null;
  const norm = normalizeText(canalRaw);
  // ordena para checar "americas" antes de "rocha miranda" (independência,
  // mas mantém a intenção explícita da regra de negócio)
  const ordered = [
    UNITS.find((u) => u.slug === "americas")!,
    ...UNITS.filter((u) => u.slug !== "americas"),
  ];
  for (const unit of ordered) {
    if (unit.aliases.some((alias) => norm.includes(alias))) {
      return unit;
    }
  }
  return null;
}
