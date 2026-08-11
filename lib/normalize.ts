/**
 * Converte campos monetários do export Layers para number (reais).
 * O export mistura dois formatos no mesmo arquivo:
 *   - número puro: "300", "0"
 *   - moeda formatada: "R$0,00"
 * (confirmado por inspeção direta dos CSVs — coluna "Valor dos Descontos"
 * vem formatada, as demais colunas de valor vêm como número puro).
 */
export function parseMoney(raw: string | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  if (trimmed.includes("R$")) {
    const cleaned = trimmed
      .replace("R$", "")
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");
    const value = Number.parseFloat(cleaned);
    return Number.isFinite(value) ? value : 0;
  }
  // número puro, mas ainda pode vir com vírgula decimal
  const normalized = trimmed.replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Parser de "Data da Venda". Formato observado: "8/8/2026, 11:14".
 *
 * Hipótese CORRIGIDA em 11/08/2026: dia/mês/ano (D/M/YYYY), não mês/dia/ano
 * como se assumiu inicialmente. A hipótese original (M/D, padrão en-US) foi
 * adotada por falta de evidência — os primeiros dados disponíveis (14
 * registros) eram todos do dia 8/8, onde dia e mês coincidem e não
 * desambiguam nada. A carga de 11/08/2026 trouxe registros "10/8/2026" —
 * sob a hipótese M/D isso seria 8 de outubro, uma data FUTURA impossível
 * para uma venda já registrada num arquivo gerado em 11/08/2026 (conferir
 * pelo timestamp ISO no nome do arquivo). Sob D/M é 10 de agosto, um dia
 * antes da geração do arquivo — plausível. Essa é a primeira evidência
 * real disponível nos dados, e ela contradiz a hipótese original.
 *
 * Validação: se o componente de MÊS (2º valor, em D/M) for > 12, o formato
 * não é D/M nem M/D — ver checagem em lib/etl.ts (dataQuality:
 * "formato_data_ambiguo").
 */
export function parseDataVenda(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const match = raw
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, a, b, year, hour, minute, second] = match;
  const day = Number.parseInt(a, 10);
  const month = Number.parseInt(b, 10);
  const date = new Date(
    Number.parseInt(year, 10),
    month - 1,
    day,
    Number.parseInt(hour, 10),
    Number.parseInt(minute, 10),
    second ? Number.parseInt(second, 10) : 0,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** true quando o componente de mês (2º valor, formato D/M) é > 12 — prova que nem D/M nem M/D descrevem o dado */
export function dataVendaFormatoAmbiguo(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return false;
  const month = Number.parseInt(match[2], 10);
  return month > 12;
}

export function formatDateBR(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function formatDateTimeBR(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Formata em R$ sem casas decimais (arredondado), por pedido do usuário —
 * ex.: R$ 22.800 em vez de R$ 22.800,00. Usado em todo o painel. */
export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const PREPOSICOES_MINUSCULAS = new Set(["de", "da", "do", "das", "dos"]);

function capitalizarPalavra(palavra: string): string {
  // preserva hífens (ex.: "maria-jose" -> "Maria-Jose")
  return palavra
    .split("-")
    .map((parte) => (parte.length > 0 ? parte[0].toUpperCase() + parte.slice(1) : parte))
    .join("-");
}

/**
 * Formata um nome de pessoa em Title Case só para EXIBIÇÃO — nunca usar
 * para chaves de deduplicação (alunoKey já normaliza separadamente em
 * normalizeNameForKey) nem para persistir/alterar o dado original. Trata
 * registros vindos totalmente em maiúsculas ou minúsculas do export
 * (ex.: "JOÃO DA SILVA" ou "maria oliveira") e mantém preposições
 * (de/da/do/das/dos) em minúsculas.
 */
export function toTitleCaseName(name: string | null | undefined): string {
  if (!name || !name.trim()) return "";
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((palavra) =>
      PREPOSICOES_MINUSCULAS.has(palavra) ? palavra : capitalizarPalavra(palavra),
    )
    .join(" ");
}

export interface FormulariosParsed {
  alunoNome: string | null;
  alunoDataNascimentoRaw: string | null;
  responsavelNome: string | null;
  responsavelTelefone: string | null;
  serieAtual: string | null;
  seriePretendida: string | null;
}

/**
 * Extrai dados do aluno a partir do campo concatenado "Formulários".
 *
 * Padrão observado nos 14 registros disponíveis (100% de consistência):
 *   nome_do_aluno | data_nascimento | nome_do_responsavel | telefone | serie_atual | serie_pretendida
 *
 * Os 5 primeiros segmentos batem exatamente com as colunas "Formulário 1..5"
 * do CSV; o 6º segmento (série pretendida para 2027) só existe no campo
 * concatenado "Formulários", não em coluna própria — por isso o parsing usa
 * o campo concatenado como fonte primária, com fallback para as colunas
 * "Formulário 1..5" quando o padrão de 6 segmentos não é encontrado.
 */
export function parseFormularios(
  formulariosRaw: string,
  fallback: { f1: string; f2: string; f3: string; f4: string; f5: string },
): FormulariosParsed {
  // não filtra segmentos vazios: a posição de cada segmento importa
  const parts = formulariosRaw.split("|").map((p) => p.trim());

  if (parts.length >= 6) {
    return {
      alunoNome: parts[0] || null,
      alunoDataNascimentoRaw: parts[1] || null,
      responsavelNome: parts[2] || null,
      responsavelTelefone: parts[3] || null,
      serieAtual: parts[4] || null,
      seriePretendida: parts[5] || null,
    };
  }
  if (parts.length === 5) {
    return {
      alunoNome: parts[0] || null,
      alunoDataNascimentoRaw: parts[1] || null,
      responsavelNome: parts[2] || null,
      responsavelTelefone: parts[3] || null,
      serieAtual: parts[4] || null,
      seriePretendida: null,
    };
  }
  // fallback: usa as colunas individuais "Formulário 1..5"
  const hasFallback = [fallback.f1, fallback.f2, fallback.f3, fallback.f4, fallback.f5].some(
    (v) => v && v.trim().length > 0,
  );
  if (!hasFallback) {
    return {
      alunoNome: null,
      alunoDataNascimentoRaw: null,
      responsavelNome: null,
      responsavelTelefone: null,
      serieAtual: null,
      seriePretendida: null,
    };
  }
  return {
    alunoNome: fallback.f1 || null,
    alunoDataNascimentoRaw: fallback.f2 || null,
    responsavelNome: fallback.f3 || null,
    responsavelTelefone: fallback.f4 || null,
    serieAtual: fallback.f5 || null,
    seriePretendida: null,
  };
}

/**
 * Normaliza uma string de nome para uso como parte de chave de deduplicação:
 * minúsculo, sem acento, espaços colapsados. NÃO usar para exibição.
 */
export function normalizeNameForKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza uma data de nascimento em formatos variados (dd/mm/yyyy ou
 * ddmmyyyy sem separador, ambos observados nos dados) para "yyyy-mm-dd"
 * quando possível, para uso estável em chave de deduplicação. Caso não
 * seja possível interpretar, retorna a string original em minúsculo/trim
 * (ainda serve como parte de chave, só não é comparável entre formatos).
 */
export function normalizeBirthDateForKey(raw: string): string {
  const trimmed = raw.trim();
  const withSlashes = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (withSlashes) {
    const [, d, m, y] = withSlashes;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const noSeparator = trimmed.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (noSeparator) {
    const [, d, m, y] = noSeparator;
    return `${y}-${m}-${d}`;
  }
  return trimmed.toLowerCase();
}
