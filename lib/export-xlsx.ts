import type { ItemVenda, Pedido } from "./types";
import { formatDateBR, formatDateTimeBR } from "./normalize";
import { STATUS_BUCKET_LABEL } from "./status";

export interface ExportRow {
  pedido: Pedido;
  item: ItemVenda;
  valorRateado: number;
}

/**
 * Gera e baixa um .xlsx com o detalhamento de "Alunos e pedidos" — mesma
 * granularidade e mesmos campos exibidos no drill-down da tabela (1 linha
 * por aluno/item). Roda inteiramente no navegador (import dinâmico do
 * exceljs, carregado só quando o botão é clicado, para não engordar o
 * bundle inicial da página).
 */
export async function exportAlunosPedidosToExcel(
  rows: ExportRow[],
  filenameSuffix: string,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Painel Bolsão Matriz 2027";
  wb.created = new Date();

  const ws = wb.addWorksheet("Alunos e Pedidos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const columns: { header: string; key: string; width: number }[] = [
    { header: "Unidade", key: "unidade", width: 20 },
    { header: "Aluno", key: "aluno", width: 32 },
    { header: "Data de Nascimento", key: "nascimento", width: 16 },
    { header: "Série Atual", key: "serieAtual", width: 16 },
    { header: "Série Pretendida (2027)", key: "seriePretendida", width: 24 },
    { header: "Responsável", key: "responsavel", width: 30 },
    { header: "Telefone do Responsável", key: "telefone", width: 18 },
    { header: "E-mail do Responsável", key: "email", width: 28 },
    { header: "CPF do Responsável", key: "cpf", width: 16 },
    { header: "Endereço", key: "endereco", width: 42 },
    { header: "Produto", key: "produto", width: 24 },
    { header: "Valor (R$)", key: "valor", width: 12 },
    { header: "Status", key: "status", width: 18 },
    { header: "Status Original (Layers)", key: "statusOriginal", width: 20 },
    { header: "Método de Pagamento", key: "metodoPagamento", width: 22 },
    { header: "Parcelas", key: "parcelas", width: 10 },
    { header: "Data da Venda", key: "dataVenda", width: 14 },
    { header: "Data/Hora da Venda", key: "dataHoraVenda", width: 18 },
    { header: "Código do Pedido", key: "codigoPedido", width: 18 },
    { header: "Código do Pedido (alt.)", key: "codigoPedidoAlt", width: 18 },
    { header: "ID da Transação", key: "transacaoId", width: 28 },
    { header: "Canal de Venda", key: "canal", width: 26 },
    { header: "Marketplace", key: "marketplace", width: 32 },
  ];
  ws.columns = columns;

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3D8F8A" } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 20;

  for (const { pedido, item, valorRateado } of rows) {
    ws.addRow({
      unidade: pedido.unidadeNome ?? "Não identificada",
      aluno: item.alunoNome ?? "Não identificado",
      nascimento: item.alunoDataNascimentoRaw ?? "",
      serieAtual: item.serieAtual ?? "",
      seriePretendida: item.seriePretendida ?? "",
      responsavel: item.alunoResponsavelNome ?? item.clienteNome,
      telefone: item.alunoResponsavelTelefone ?? item.clienteTelefone,
      email: item.clienteEmail,
      cpf: item.clienteCpf,
      endereco: item.clienteEndereco,
      produto: item.nomeItem,
      valor: Math.round(valorRateado * 100) / 100,
      status: STATUS_BUCKET_LABEL[pedido.statusBucket],
      statusOriginal: item.statusPagamentoRaw,
      metodoPagamento: `${item.metodoPagamento}${item.bandeiraCartao ? ` (${item.bandeiraCartao})` : ""}`,
      parcelas: item.numeroParcelas ?? "",
      dataVenda: formatDateBR(pedido.dataVenda),
      dataHoraVenda: formatDateTimeBR(pedido.dataVenda),
      codigoPedido: pedido.codigoVenda,
      codigoPedidoAlt: item.codigoPedidoAlt ?? "",
      transacaoId: item.transacaoId ?? "",
      canal: item.canalOriginal,
      marketplace: item.nomeMarketplace,
    });
  }

  const valorColumn = ws.getColumn("valor");
  valorColumn.numFmt = '"R$" #,##0';
  valorColumn.alignment = { horizontal: "right" };

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `alunos-pedidos-bolsao-matriz-2027-${filenameSuffix}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
