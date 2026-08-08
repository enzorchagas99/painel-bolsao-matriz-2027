import { identifyUnitByChannel } from "../lib/units";
import { classifyStatus } from "../lib/status";
import { parseMoney, parseDataVenda, dataVendaFormatoAmbiguo } from "../lib/normalize";

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

console.log("\nEdge cases concluídos.");
