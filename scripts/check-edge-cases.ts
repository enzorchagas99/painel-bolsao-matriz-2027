import { identifyUnitByChannel } from "../lib/units";
import { classifyStatus } from "../lib/status";
import { parseMoney, parseDataVenda, dataVendaFormatoAmbiguo, toTitleCaseName } from "../lib/normalize";
import { dropSupersededPendingItems, computeKpiForPedidos } from "../lib/etl";
import type { ItemVenda, Pedido, DataQualityIssue } from "../lib/types";

function fakeItem(overrides: Partial<ItemVenda>): ItemVenda {
  return {
    arquivoOrigem: "teste.csv",
    linhaOrigem: 1,
    codigoVenda: "LP1-TEST",
    transacaoId: null,
    unidadeSlug: "tijuca",
    unidadeNome: "Tijuca",
    canalOriginal: "Bolsão 2027 - Tijuca",
    nomeItem: "Pré-Matrícula Bolsão 2027",
    skuItem: "#TEST",
    quantidade: 1,
    valorItem: 300,
    valorItens: 300,
    valorFrete: 0,
    valorDescontos: 0,
    valorJuros: 0,
    dataVendaRaw: "8/8/2026, 10:00",
    dataVenda: new Date(2026, 7, 8, 10, 0),
    statusPagamentoRaw: "Pago",
    statusBucket: "pago",
    metodoPagamento: "Pix",
    bandeiraCartao: "",
    numeroParcelas: 1,
    clienteNome: "Responsavel Teste",
    clienteEmail: "teste@example.com",
    clienteTelefone: "21999999999",
    clienteCpf: "000.000.000-00",
    clienteEndereco: "Rua Teste, 1",
    alunoNome: "Aluno Teste",
    alunoDataNascimentoRaw: "01/01/2015",
    alunoResponsavelNome: "Responsavel Teste",
    alunoResponsavelTelefone: "21999999999",
    serieAtual: "5 ano",
    seriePretendida: "6 ano",
    formulariosRaw: "",
    alunoKey: "aluno:aluno teste|2015-01-01",
    linkAcompanhamento: "",
    categoria: "Bolsão",
    nomeMarketplace: "",
    codigoPedidoAlt: null,
    ...overrides,
  };
}

function assertEq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "OK " : "FAIL"} ${label} -> actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

// Regra especial Américas: mesmo vindo de um arquivo "Rocha Miranda", o
// canal deve mandar na classificação.
assertEq(
  "canal Américas dentro de arquivo Rocha Miranda",
  identifyUnitByChannel("Bolsão 2027 - Américas")?.slug,
  "americas",
);
assertEq(
  "canal Rocha Miranda normal",
  identifyUnitByChannel("Bolsão 2027 - Rocha Miranda")?.slug,
  "rocha-miranda",
);
assertEq(
  "canal com ano diferente (2026) ainda resolve Caxias",
  identifyUnitByChannel("Bolsão 2026 - Caxias")?.slug,
  "duque-de-caxias",
);
assertEq(
  "canal desconhecido retorna null",
  identifyUnitByChannel("Bolsão 2027 - Unidade Fantasma"),
  null,
);

assertEq("status Pago", classifyStatus("Pago"), "pago");
assertEq("status Vencido", classifyStatus("Vencido"), "pendente_vencido");
assertEq("status Cancelado", classifyStatus("Cancelado"), "cancelado");
assertEq("status Estornado", classifyStatus("Estornado"), "estornado");
assertEq("status desconhecido", classifyStatus("Zzz"), "nao_classificado");
assertEq("status vazio", classifyStatus(""), "nao_classificado");

assertEq("valor puro", parseMoney("300"), 300);
assertEq("valor R$ formatado", parseMoney("R$0,00"), 0);
assertEq("valor R$ com milhar", parseMoney("R$1.234,56"), 1234.56);

assertEq(
  "data M/D/YYYY",
  parseDataVenda("8/8/2026, 11:14")?.toISOString(),
  new Date(2026, 7, 8, 11, 14, 0).toISOString(),
);
assertEq("data ambigua (dia=25 no 1o componente)", dataVendaFormatoAmbiguo("25/1/2026, 10:00"), true);
assertEq("data nao ambigua", dataVendaFormatoAmbiguo("8/8/2026, 11:14"), false);

// Regra: mesmo aluno com pedido vencido + pedido pago -> descarta o vencido
{
  const issues: DataQualityIssue[] = [];
  const items = [
    fakeItem({ codigoVenda: "LP1-VENCIDO", statusBucket: "pendente_vencido", statusPagamentoRaw: "Vencido" }),
    fakeItem({ codigoVenda: "LP1-PAGO", statusBucket: "pago", statusPagamentoRaw: "Pago" }),
  ];
  const result = dropSupersededPendingItems(items, issues);
  assertEq(
    "vencido substituido por pago: mantém só o pago",
    result.map((i) => i.codigoVenda),
    ["LP1-PAGO"],
  );
  assertEq("vencido substituido por pago: gera alerta", issues.length, 1);
}

// Regra: aluno só com pedido vencido (sem pago) -> NÃO descarta
{
  const issues: DataQualityIssue[] = [];
  const items = [
    fakeItem({ codigoVenda: "LP1-SOVENCIDO", statusBucket: "pendente_vencido", statusPagamentoRaw: "Vencido" }),
  ];
  const result = dropSupersededPendingItems(items, issues);
  assertEq(
    "vencido sem pago correspondente: mantém",
    result.map((i) => i.codigoVenda),
    ["LP1-SOVENCIDO"],
  );
  assertEq("vencido sem pago correspondente: sem alerta", issues.length, 0);
}

// Regra: alunos diferentes não se afetam entre si
{
  const issues: DataQualityIssue[] = [];
  const items = [
    fakeItem({ codigoVenda: "LP1-A-VENCIDO", alunoKey: "aluno:a|2015-01-01", statusBucket: "pendente_vencido" }),
    fakeItem({ codigoVenda: "LP1-B-PAGO", alunoKey: "aluno:b|2016-02-02", statusBucket: "pago" }),
  ];
  const result = dropSupersededPendingItems(items, issues);
  assertEq(
    "alunos diferentes não interferem entre si",
    result.map((i) => i.codigoVenda).sort(),
    ["LP1-A-VENCIDO", "LP1-B-PAGO"],
  );
}

// Regra: ticket médio deve dividir por unidades (Quantidade), não por pedido
{
  // 2 pedidos de R$300 (1 unidade cada) + 1 pedido de R$600 com Quantidade=2
  // numa única linha (1 aluno nomeado, 2ª unidade sem nome). Ticket médio
  // correto = 1200 / (1+1+2) = 300, NÃO 1200/3 pedidos = 400.
  const pedidos: Pedido[] = [
    {
      codigoVenda: "LP1-A",
      unidadeSlug: "tijuca",
      unidadeNome: "Tijuca",
      valorPedido: 300,
      dataVenda: new Date(2026, 7, 8),
      statusBucket: "pago",
      statusPagamentoRaw: "Pago",
      metodoPagamento: "Pix",
      numeroParcelas: 1,
      itens: [fakeItem({ codigoVenda: "LP1-A", alunoKey: "aluno:a|2015-01-01", quantidade: 1, valorItens: 300 })],
    },
    {
      codigoVenda: "LP1-B",
      unidadeSlug: "tijuca",
      unidadeNome: "Tijuca",
      valorPedido: 300,
      dataVenda: new Date(2026, 7, 8),
      statusBucket: "pago",
      statusPagamentoRaw: "Pago",
      metodoPagamento: "Pix",
      numeroParcelas: 1,
      itens: [fakeItem({ codigoVenda: "LP1-B", alunoKey: "aluno:b|2015-01-01", quantidade: 1, valorItens: 300 })],
    },
    {
      codigoVenda: "LP1-C",
      unidadeSlug: "tijuca",
      unidadeNome: "Tijuca",
      valorPedido: 600,
      dataVenda: new Date(2026, 7, 8),
      statusBucket: "pago",
      statusPagamentoRaw: "Pago",
      metodoPagamento: "Pix",
      numeroParcelas: 1,
      itens: [fakeItem({ codigoVenda: "LP1-C", alunoKey: "aluno:c|2015-01-01", quantidade: 2, valorItens: 600 })],
    },
  ];
  const kpi = computeKpiForPedidos("tijuca", "Tijuca", pedidos);
  assertEq("ticket médio soma Quantidade, não pedidos", kpi.ticketMedioPago, 300);
  assertEq("valor vendido não é afetado pela Quantidade", kpi.valorVendidoBruto, 1200);
}

assertEq("Title Case: todo maiúsculo", toTitleCaseName("JOÃO DA SILVA"), "João da Silva");
assertEq("Title Case: todo minúsculo", toTitleCaseName("maria oliveira"), "Maria Oliveira");
assertEq(
  "Title Case: várias preposições",
  toTitleCaseName("ANA CLARA DOS SANTOS DAS NEVES DE OLIVEIRA"),
  "Ana Clara dos Santos das Neves de Oliveira",
);
assertEq("Title Case: já misto permanece correto", toTitleCaseName("Pedro Augusto"), "Pedro Augusto");
assertEq("Title Case: nome com hífen", toTitleCaseName("maria-jose silva-santos"), "Maria-Jose Silva-Santos");
assertEq("Title Case: null retorna vazio", toTitleCaseName(null), "");
assertEq("Title Case: espaços extras são normalizados", toTitleCaseName("  JOÃO   DA SILVA  "), "João da Silva");

console.log("\nEdge cases concluídos.");
