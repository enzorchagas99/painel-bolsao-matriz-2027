import type { StatusBucket } from "./types";

/**
 * Classificação do campo "Status do Pagamento" do export Layers.
 *
 * IMPORTANTE — o que esta coluna é e o que não é:
 * "Status do Pagamento" é o status já resumido pela Layers no nível da
 * VENDA (não da parcela). Isso é diferente do modelo de dados granular
 * documentado em `documentacao_tecnica_data_engine.md` (tabelas
 * `sales`/`payables` do pipeline de conciliação financeira, que tem status
 * como `active`/`released`/`overdue` por parcela) — aquele pipeline cobre
 * as mensalidades recorrentes das escolas via API/Parquet; este export é o
 * relatório de checkout "itens da venda" do link de pagamento avulso
 * (produto "Pré-Matrícula Bolsão 2027", R$300 à vista/parcelado), uma
 * fonte de dados diferente, sem arquivo de parcelas (`payables`)
 * disponível. Por isso não é possível aqui distinguir "pago mas retido
 * pelo gateway" de "pago e liberado à escola" — essa granularidade não
 * existe nesta fonte. Caso a distinção seja necessária no futuro, ela
 * dependeria de um export adicional de parcelas/repasses.
 *
 * Valores observados nos 14 registros disponíveis na primeira extração:
 * "Pago" e "Vencido". Os demais valores abaixo (Pendente, Cancelado,
 * Estornado, Chargeback, Reembolsado etc.) são antecipados a partir do
 * vocabulário de pagamentos em português usado pela própria Layers nos
 * outros três documentos de referência lidos (RESUMO_INVESTIGACAO,
 * documentacao_tecnica, METODOLOGIA) — não foram confirmados nesta fonte
 * específica. Qualquer valor que não bata com o mapeamento abaixo é
 * marcado como "nao_classificado" e sinalizado no painel de qualidade de
 * dados, em vez de ser presumido silenciosamente.
 */
const STATUS_MAP: Record<string, StatusBucket> = {
  pago: "pago",
  aprovado: "pago",
  "pagamento aprovado": "pago",
  confirmado: "pago",
  liberado: "pago",

  pendente: "pendente_vencido",
  "aguardando pagamento": "pendente_vencido",
  "em processamento": "pendente_vencido",
  processando: "pendente_vencido",
  vencido: "pendente_vencido",
  atrasado: "pendente_vencido",
  inadimplente: "pendente_vencido",

  cancelado: "cancelado",
  cancelada: "cancelado",
  "cancelado pelo cliente": "cancelado",
  "cancelado pela loja": "cancelado",

  estornado: "estornado",
  estornada: "estornado",
  reembolsado: "estornado",
  reembolsada: "estornado",
  chargeback: "estornado",
  "chargeback contestado": "estornado",
};

export function classifyStatus(raw: string | undefined | null): StatusBucket {
  if (!raw) return "nao_classificado";
  const norm = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  return STATUS_MAP[norm] ?? "nao_classificado";
}

export const STATUS_BUCKET_LABEL: Record<StatusBucket, string> = {
  pago: "Pago",
  pendente_vencido: "Pendente / Vencido",
  cancelado: "Cancelado",
  estornado: "Estornado",
  nao_classificado: "Não classificado",
};

export const STATUS_BUCKET_COLOR: Record<StatusBucket, string> = {
  pago: "bg-sem-green-soft text-sem-green border-sem-green/30",
  pendente_vencido: "bg-brand-orange-soft text-brand-orange-dark border-brand-orange/30",
  cancelado: "bg-paper-2 text-ink-3 border-line",
  estornado: "bg-sem-red-soft text-sem-red border-sem-red/30",
  nao_classificado: "bg-sem-purple-soft text-sem-purple border-sem-purple/30",
};
