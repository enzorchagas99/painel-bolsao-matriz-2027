export type StatusBucket =
  | "pago"
  | "pendente_vencido"
  | "cancelado"
  | "estornado"
  | "nao_classificado";

export interface DataQualityIssue {
  tipo: string;
  descricao: string;
  arquivoOrigem: string;
  linha: number;
  codigoVenda?: string;
}

/** Uma linha de item de venda, já normalizada e enriquecida. */
export interface ItemVenda {
  // Rastreabilidade da origem
  arquivoOrigem: string;
  linhaOrigem: number;

  // Pedido / venda
  codigoVenda: string;
  transacaoId: string | null;

  // Unidade (resolvida por "Nome do Canal", ver lib/units.ts)
  unidadeSlug: string | null;
  unidadeNome: string | null;
  canalOriginal: string;

  // Produto
  nomeItem: string;
  skuItem: string;
  quantidade: number;

  // Valores (em reais, já convertidos)
  valorItem: number;
  valorItens: number;
  valorFrete: number;
  valorDescontos: number;
  valorJuros: number;

  // Data
  dataVendaRaw: string;
  dataVenda: Date | null;

  // Pagamento
  statusPagamentoRaw: string;
  statusBucket: StatusBucket;
  metodoPagamento: string;
  bandeiraCartao: string;
  numeroParcelas: number | null;

  // Comprador (responsável financeiro)
  clienteNome: string;
  clienteEmail: string;
  clienteTelefone: string;
  clienteCpf: string;
  clienteEndereco: string;

  // Aluno (extraído do campo "Formulários")
  alunoNome: string | null;
  alunoDataNascimentoRaw: string | null;
  alunoResponsavelNome: string | null;
  alunoResponsavelTelefone: string | null;
  serieAtual: string | null;
  seriePretendida: string | null;
  formulariosRaw: string;

  /** chave de deduplicação de aluno — ver docstring em lib/etl.ts */
  alunoKey: string;

  linkAcompanhamento: string;

  // Campos vistos apenas no export consolidado "Matriz" (ver lib/etl.ts)
  categoria: string;
  nomeMarketplace: string;
  codigoPedidoAlt: string | null;
}

/**
 * Um pedido (venda), agrupado por "Código da Venda". Um pedido pode conter
 * MAIS DE UM aluno (checkout único com N pré-matrículas, uma por filho) —
 * por isso o pedido não tem "o aluno", e sim uma lista de itens, cada um
 * com seu próprio aluno. Os campos financeiros/de pagamento (valor,
 * status, data, método) são do PEDIDO (repetidos em todas as linhas do
 * mesmo Código da Venda na fonte) — nunca somar por item para não duplicar.
 */
export interface Pedido {
  codigoVenda: string;
  unidadeSlug: string | null;
  unidadeNome: string | null;
  valorPedido: number;
  dataVenda: Date | null;
  statusBucket: StatusBucket;
  statusPagamentoRaw: string;
  metodoPagamento: string;
  numeroParcelas: number | null;
  itens: ItemVenda[];
}

export interface UnitKpi {
  slug: string;
  nome: string;
  alunosPreMatricula: number;
  pedidos: number;
  valorVendidoBruto: number;
  valorPago: number;
  valorPendenteVencido: number;
  valorCancelado: number;
  valorEstornado: number;
  ticketMedioPago: number;
  taxaPagamentoPct: number; // valorPago / valorVendidoBruto
}

export interface EvolucaoDiaria {
  data: string; // YYYY-MM-DD
  pedidos: number;
  valor: number;
}

export interface DashboardData {
  geradoEm: string;
  pedidos: Pedido[];
  itens: ItemVenda[];
  kpisPorUnidade: UnitKpi[];
  kpiGeral: UnitKpi;
  evolucaoDiaria: EvolucaoDiaria[];
  dataQualityIssues: DataQualityIssue[];
  arquivosProcessados: string[];
}
