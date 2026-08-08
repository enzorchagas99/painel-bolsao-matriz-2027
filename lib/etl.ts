import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { identifyUnitByChannel, UNITS } from "./units";
import {
  parseMoney,
  parseDataVenda,
  dataVendaFormatoAmbiguo,
  parseFormularios,
  normalizeNameForKey,
  normalizeBirthDateForKey,
} from "./normalize";
import { classifyStatus } from "./status";
import type {
  ItemVenda,
  Pedido,
  DashboardData,
  DataQualityIssue,
  UnitKpi,
  EvolucaoDiaria,
} from "./types";

const RAW_DATA_DIR = path.join(process.cwd(), "data", "raw");

/**
 * Granularidade e chaves adotadas (documentação exigida pelo negócio):
 *
 * - PEDIDO/VENDA: chave = "Código da Venda" (ex.: "LP1-CRLCX-PXH2L"). Uma
 *   venda pode, em tese, gerar múltiplas linhas de item no export (uma por
 *   produto comprado); na base atual, 100% das vendas têm exatamente 1
 *   linha (produto único "Pré-Matrícula Bolsão 2027", quantidade sempre 1).
 *   O pipeline agrupa por "Código da Venda" e usa o valor de "Valor dos
 *   Itens" (valor do PEDIDO, não da linha) para não somar em duplicidade
 *   caso apareçam múltiplas linhas por pedido no futuro — mesmo princípio
 *   da Regra 2 documentada em documentacao_tecnica_data_engine.md
 *   ("nunca somar o valor total diretamente sobre todas as linhas").
 *
 * - ALUNO: não há um ID de aluno na fonte (o CPF presente é do
 *   responsável financeiro, não da criança). A chave usada é
 *   nome_do_aluno normalizado + data_de_nascimento normalizada, extraídos
 *   do campo "Formulários" (ver parseFormularios em lib/normalize.ts).
 *   Quando esses dois campos não podem ser extraídos, cai-se em um
 *   fallback por responsável (nome + CPF do comprador) e, em último caso,
 *   por pedido — cada fallback é registrado como alerta de qualidade de
 *   dados, nunca aplicado silenciosamente.
 *
 * - UNIDADE: resolvida pelo campo "Nome do Canal" de cada linha (não pelo
 *   nome do arquivo de origem) — ver identifyUnitByChannel em units.ts.
 *   Isso é o que permite separar corretamente Américas de Rocha Miranda
 *   mesmo que ambas venham no mesmo arquivo/exportação.
 */

interface RawRow {
  [key: string]: string;
}

function readCsvFile(filePath: string): RawRow[] {
  const buffer = fs.readFileSync(filePath);
  // remove BOM UTF-8, se presente
  const content = buffer.toString("utf8").replace(/^﻿/, "");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as RawRow[];
}

function extractTransacaoId(link: string | undefined): string | null {
  if (!link) return null;
  const match = link.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return match ? match[1] : null;
}

function buildAlunoKey(
  alunoNome: string | null,
  alunoDob: string | null,
  clienteNome: string,
  clienteCpf: string,
  codigoVenda: string,
  issues: DataQualityIssue[],
  arquivoOrigem: string,
  linha: number,
): string {
  if (alunoNome && alunoNome.trim() && alunoDob && alunoDob.trim()) {
    return `aluno:${normalizeNameForKey(alunoNome)}|${normalizeBirthDateForKey(alunoDob)}`;
  }
  issues.push({
    tipo: "aluno_nao_identificado",
    descricao:
      "Não foi possível extrair nome e/ou data de nascimento do aluno a partir do campo Formulários. Usando responsável como chave alternativa.",
    arquivoOrigem,
    linha,
    codigoVenda,
  });
  if (clienteNome && clienteNome.trim() && clienteCpf && clienteCpf.trim()) {
    return `responsavel:${normalizeNameForKey(clienteNome)}|${clienteCpf.trim()}`;
  }
  issues.push({
    tipo: "aluno_e_responsavel_nao_identificados",
    descricao:
      "Nem aluno nem responsável puderam ser identificados de forma confiável. Usando o código do pedido como chave (não deduplica entre pedidos).",
    arquivoOrigem,
    linha,
    codigoVenda,
  });
  return `pedido:${codigoVenda}`;
}

function processFile(
  filePath: string,
  issues: DataQualityIssue[],
): ItemVenda[] {
  const fileName = path.basename(filePath);
  const rows = readCsvFile(filePath);
  const items: ItemVenda[] = [];

  rows.forEach((row, idx) => {
    const linha = idx + 2; // +1 header, +1 base 1
    const codigoVenda = (row["Código da Venda"] || "").trim();
    if (!codigoVenda) {
      issues.push({
        tipo: "linha_sem_codigo_venda",
        descricao: "Linha sem Código da Venda — ignorada no processamento.",
        arquivoOrigem: fileName,
        linha,
      });
      return;
    }

    const canalOriginal = (row["Nome do Canal"] || "").trim();
    const unit = identifyUnitByChannel(canalOriginal);
    if (!unit) {
      issues.push({
        tipo: "unidade_nao_identificada",
        descricao: `Não foi possível identificar a unidade a partir do canal "${canalOriginal || "(vazio)"}".`,
        arquivoOrigem: fileName,
        linha,
        codigoVenda,
      });
    }

    const fileBaseUnitGuess = identifyUnitByChannel(
      fileName.split("_itens_da_venda")[0],
    );
    if (unit && fileBaseUnitGuess && unit.slug !== fileBaseUnitGuess.slug) {
      issues.push({
        tipo: "unidade_reclassificada_por_canal",
        descricao: `Arquivo de origem sugere "${fileBaseUnitGuess.nome}", mas o canal "${canalOriginal}" indica "${unit.nome}". Linha classificada como ${unit.nome} (regra do canal prevalece).`,
        arquivoOrigem: fileName,
        linha,
        codigoVenda,
      });
    }

    const valorItem = parseMoney(row["Valor do Item na Venda"]);
    const valorItens = parseMoney(row["Valor dos Itens"]);
    if (valorItens <= 0) {
      issues.push({
        tipo: "valor_zero_ou_ausente",
        descricao: "Valor dos Itens igual a zero ou ausente.",
        arquivoOrigem: fileName,
        linha,
        codigoVenda,
      });
    }

    const dataVendaRaw = (row["Data da Venda"] || "").trim();
    const dataVenda = parseDataVenda(dataVendaRaw);
    if (dataVendaRaw && !dataVenda) {
      issues.push({
        tipo: "data_venda_invalida",
        descricao: `Não foi possível interpretar a data "${dataVendaRaw}".`,
        arquivoOrigem: fileName,
        linha,
        codigoVenda,
      });
    }
    if (dataVendaFormatoAmbiguo(dataVendaRaw)) {
      issues.push({
        tipo: "formato_data_ambiguo",
        descricao: `A data "${dataVendaRaw}" tem o primeiro componente > 12: a hipótese mês/dia (M/D) adotada para este campo está incorreta para este registro — revisar parser de data.`,
        arquivoOrigem: fileName,
        linha,
        codigoVenda,
      });
    }

    const statusPagamentoRaw = (row["Status do Pagamento"] || "").trim();
    if (!statusPagamentoRaw) {
      issues.push({
        tipo: "status_pagamento_ausente",
        descricao: "Status do Pagamento vazio.",
        arquivoOrigem: fileName,
        linha,
        codigoVenda,
      });
    }
    const statusBucket = classifyStatus(statusPagamentoRaw);
    if (statusBucket === "nao_classificado" && statusPagamentoRaw) {
      issues.push({
        tipo: "status_nao_mapeado",
        descricao: `Status "${statusPagamentoRaw}" não está no mapeamento conhecido (ver lib/status.ts). Tratado como "não classificado" — não contabilizado como pago, pendente, cancelado ou estornado.`,
        arquivoOrigem: fileName,
        linha,
        codigoVenda,
      });
    }

    const formulariosRaw = row["Formulários"] || "";
    const parsedForm = parseFormularios(formulariosRaw, {
      f1: row["Formulário 1"] || "",
      f2: row["Formulário 2"] || "",
      f3: row["Formulário 3"] || "",
      f4: row["Formulário 4"] || "",
      f5: row["Formulário 5"] || "",
    });

    const clienteNome = (row["Cliente"] || "").trim();
    const clienteCpf = (row["CPF"] || "").trim();

    const alunoKey = buildAlunoKey(
      parsedForm.alunoNome,
      parsedForm.alunoDataNascimentoRaw,
      clienteNome,
      clienteCpf,
      codigoVenda,
      issues,
      fileName,
      linha,
    );

    const parcelasRaw = (row["Número de Parcelas"] || "").trim();
    const numeroParcelas = parcelasRaw ? Number.parseInt(parcelasRaw, 10) : null;

    items.push({
      arquivoOrigem: fileName,
      linhaOrigem: linha,
      codigoVenda,
      transacaoId: extractTransacaoId(row["Link de Acompanhamento"]),
      unidadeSlug: unit ? unit.slug : null,
      unidadeNome: unit ? unit.nome : null,
      canalOriginal,
      nomeItem: (row["Nome do Item"] || "").trim(),
      skuItem: (row["SKU do Item"] || "").trim(),
      quantidade: Number.parseInt(row["Quantidade"] || "1", 10) || 1,
      valorItem,
      valorItens,
      valorFrete: parseMoney(row["Valor do Frete"]),
      valorDescontos: parseMoney(row["Valor dos Descontos"]),
      valorJuros: parseMoney(row["Valor dos Juros"]),
      dataVendaRaw,
      dataVenda,
      statusPagamentoRaw,
      statusBucket,
      metodoPagamento: (row["Método de Pagamento"] || "").trim(),
      bandeiraCartao: (row["Bandeira do Cartão"] || "").trim(),
      numeroParcelas: Number.isFinite(numeroParcelas) ? numeroParcelas : null,
      clienteNome,
      clienteEmail: (row["Email"] || "").trim(),
      clienteTelefone: (row["Telefone"] || "").trim(),
      clienteCpf,
      clienteEndereco: (row["Endereço"] || "").trim(),
      alunoNome: parsedForm.alunoNome,
      alunoDataNascimentoRaw: parsedForm.alunoDataNascimentoRaw,
      alunoResponsavelNome: parsedForm.responsavelNome,
      alunoResponsavelTelefone: parsedForm.responsavelTelefone,
      serieAtual: parsedForm.serieAtual,
      seriePretendida: parsedForm.seriePretendida,
      formulariosRaw,
      alunoKey,
      linkAcompanhamento: (row["Link de Acompanhamento"] || "").trim(),
    });
  });

  return items;
}

function dedupeItems(
  items: ItemVenda[],
  issues: DataQualityIssue[],
): ItemVenda[] {
  const seen = new Map<string, ItemVenda>();
  for (const item of items) {
    const key = `${item.codigoVenda}::${item.skuItem || item.nomeItem}::${item.linkAcompanhamento}`;
    if (seen.has(key)) {
      issues.push({
        tipo: "linha_duplicada",
        descricao:
          "Linha idêntica (mesmo pedido, item e link de acompanhamento) encontrada mais de uma vez — possivelmente arquivos de exportação sobrepostos. Mantida apenas a primeira ocorrência.",
        arquivoOrigem: item.arquivoOrigem,
        linha: item.linhaOrigem,
        codigoVenda: item.codigoVenda,
      });
      continue;
    }
    seen.set(key, item);
  }
  return Array.from(seen.values());
}

function buildPedidos(
  items: ItemVenda[],
  issues: DataQualityIssue[],
): Pedido[] {
  const groups = new Map<string, ItemVenda[]>();
  for (const item of items) {
    const list = groups.get(item.codigoVenda) ?? [];
    list.push(item);
    groups.set(item.codigoVenda, list);
  }

  const pedidos: Pedido[] = [];
  for (const [codigoVenda, groupItems] of groups) {
    const first = groupItems[0];
    const valoresPedido = new Set(groupItems.map((i) => i.valorItens));
    if (valoresPedido.size > 1) {
      issues.push({
        tipo: "valor_pedido_inconsistente",
        descricao: `O pedido ${codigoVenda} tem linhas com "Valor dos Itens" divergentes entre si (${[...valoresPedido].join(", ")}). Usando o valor da primeira linha.`,
        arquivoOrigem: first.arquivoOrigem,
        linha: first.linhaOrigem,
        codigoVenda,
      });
    }
    const alunoKeys = new Set(groupItems.map((i) => i.alunoKey));
    if (alunoKeys.size > 1) {
      issues.push({
        tipo: "pedido_com_alunos_divergentes",
        descricao: `O pedido ${codigoVenda} tem linhas apontando para alunos diferentes. Usando o aluno da primeira linha.`,
        arquivoOrigem: first.arquivoOrigem,
        linha: first.linhaOrigem,
        codigoVenda,
      });
    }

    pedidos.push({
      codigoVenda,
      unidadeSlug: first.unidadeSlug,
      unidadeNome: first.unidadeNome,
      valorPedido: first.valorItens,
      dataVenda: first.dataVenda,
      statusBucket: first.statusBucket,
      statusPagamentoRaw: first.statusPagamentoRaw,
      metodoPagamento: first.metodoPagamento,
      numeroParcelas: first.numeroParcelas,
      alunoKey: first.alunoKey,
      alunoNome: first.alunoNome,
      itens: groupItems,
    });
  }

  return pedidos;
}

function emptyKpi(slug: string, nome: string): UnitKpi {
  return {
    slug,
    nome,
    alunosPreMatricula: 0,
    pedidos: 0,
    valorVendidoBruto: 0,
    valorPago: 0,
    valorPendenteVencido: 0,
    valorCancelado: 0,
    valorEstornado: 0,
    ticketMedioPago: 0,
    taxaPagamentoPct: 0,
  };
}

function computeKpiForPedidos(slug: string, nome: string, pedidos: Pedido[]): UnitKpi {
  const kpi = emptyKpi(slug, nome);
  kpi.pedidos = pedidos.length;

  const alunosValidos = new Set<string>();
  let pedidosPagos = 0;

  for (const pedido of pedidos) {
    kpi.valorVendidoBruto += pedido.valorPedido;
    if (pedido.statusBucket !== "cancelado" && pedido.statusBucket !== "estornado") {
      alunosValidos.add(pedido.alunoKey);
    }
    switch (pedido.statusBucket) {
      case "pago":
        kpi.valorPago += pedido.valorPedido;
        pedidosPagos += 1;
        break;
      case "pendente_vencido":
        kpi.valorPendenteVencido += pedido.valorPedido;
        break;
      case "cancelado":
        kpi.valorCancelado += pedido.valorPedido;
        break;
      case "estornado":
        kpi.valorEstornado += pedido.valorPedido;
        break;
      default:
        break;
    }
  }

  kpi.alunosPreMatricula = alunosValidos.size;
  kpi.ticketMedioPago = pedidosPagos > 0 ? kpi.valorPago / pedidosPagos : 0;
  kpi.taxaPagamentoPct =
    kpi.valorVendidoBruto > 0 ? (kpi.valorPago / kpi.valorVendidoBruto) * 100 : 0;

  return kpi;
}

export function buildEvolucaoDiaria(pedidos: Pedido[]): EvolucaoDiaria[] {
  const map = new Map<string, EvolucaoDiaria>();
  for (const pedido of pedidos) {
    if (!pedido.dataVenda) continue;
    const key = pedido.dataVenda.toLocaleDateString("sv-SE", {
      timeZone: "America/Sao_Paulo",
    }); // YYYY-MM-DD
    const entry = map.get(key) ?? { data: key, pedidos: 0, valor: 0 };
    entry.pedidos += 1;
    entry.valor += pedido.valorPedido;
    map.set(key, entry);
  }
  return Array.from(map.values()).sort((a, b) => a.data.localeCompare(b.data));
}

let cached: DashboardData | null = null;

export function loadDashboardData(): DashboardData {
  if (cached) return cached;

  const issues: DataQualityIssue[] = [];
  const arquivosProcessados: string[] = [];

  let allItems: ItemVenda[] = [];

  if (fs.existsSync(RAW_DATA_DIR)) {
    const files = fs
      .readdirSync(RAW_DATA_DIR)
      .filter((f) => f.toLowerCase().endsWith(".csv"))
      .sort();
    for (const file of files) {
      arquivosProcessados.push(file);
      const filePath = path.join(RAW_DATA_DIR, file);
      allItems = allItems.concat(processFile(filePath, issues));
    }
  }

  allItems = dedupeItems(allItems, issues);
  const pedidos = buildPedidos(allItems, issues);

  const kpisPorUnidade: UnitKpi[] = UNITS.map((unit) => {
    const unitPedidos = pedidos.filter((p) => p.unidadeSlug === unit.slug);
    return computeKpiForPedidos(unit.slug, unit.nome, unitPedidos);
  });

  const naoIdentificados = pedidos.filter((p) => !p.unidadeSlug);
  if (naoIdentificados.length > 0) {
    kpisPorUnidade.push(
      computeKpiForPedidos("nao-identificada", "Unidade não identificada", naoIdentificados),
    );
  }

  const kpiGeral = computeKpiForPedidos("geral", "Todas as unidades", pedidos);
  const evolucaoDiaria = buildEvolucaoDiaria(pedidos);

  cached = {
    geradoEm: new Date().toISOString(),
    pedidos,
    itens: allItems,
    kpisPorUnidade,
    kpiGeral,
    evolucaoDiaria,
    dataQualityIssues: issues,
    arquivosProcessados,
  };

  return cached;
}
