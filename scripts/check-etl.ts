import { loadDashboardData } from "../lib/etl";

const data = loadDashboardData();

console.log("Arquivos processados:", data.arquivosProcessados);
console.log("Total de itens:", data.itens.length);
console.log("Total de pedidos:", data.pedidos.length);
console.log("");
console.log("KPI geral:", JSON.stringify(data.kpiGeral, null, 2));
console.log("");
console.log("KPI por unidade:");
for (const kpi of data.kpisPorUnidade) {
  console.log(
    `  ${kpi.nome.padEnd(24)} pedidos=${kpi.pedidos} alunos=${kpi.alunosPreMatricula} vendido=${kpi.valorVendidoBruto} pago=${kpi.valorPago}`,
  );
}
console.log("");
console.log("Evolução diária:", data.evolucaoDiaria);
console.log("");
console.log(`Alertas de qualidade de dados (${data.dataQualityIssues.length}):`);
for (const issue of data.dataQualityIssues) {
  console.log(`  [${issue.tipo}] ${issue.arquivoOrigem}:${issue.linha} — ${issue.descricao}`);
}
console.log("");
console.log("Colisões de alunoKey (mesmo aluno em >1 item):");
const byAlunoKey = new Map<string, { nome: string | null; codigo: string; dob: string | null }[]>();
for (const item of data.itens) {
  const list = byAlunoKey.get(item.alunoKey) ?? [];
  list.push({ nome: item.alunoNome, codigo: item.codigoVenda, dob: item.alunoDataNascimentoRaw });
  byAlunoKey.set(item.alunoKey, list);
}
for (const [key, list] of byAlunoKey) {
  if (list.length > 1) console.log(" ", key, JSON.stringify(list));
}
console.log("");
console.log("Amostra de 3 pedidos:");
console.log(JSON.stringify(data.pedidos.slice(0, 3), null, 2));
