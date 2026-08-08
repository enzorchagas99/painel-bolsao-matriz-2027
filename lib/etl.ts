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
 *   mesmo que ambas venham no mesmo arquivo/exportação. O export
 *   consolidado "Matriz" traz um segundo campo independente, "Nome do
 *   Marketplace" (ex.: "Matriz Educação Campo Grande - Bolsão 2027"), que
 *   é usado como checagem cruzada: se ele apontar para uma unidade
 *   diferente da resolvida por "Nome do Canal", a linha gera o alerta
 *   `unidade_marketplace_canal_divergentes` em vez de decidir por um dos
 *   dois silenciosamente — isso é útil sobretudo para validar Américas
 *   quando a primeira venda real aparecer.
 *
 * - PEDIDO COM MÚLTIPLOS ALUNOS: um mesmo "Código da Venda" pode conter
 *   mais de um item/aluno (ex.: responsável compra pré-matrícula para 2
 *   filhos em um único checkout — confirmado nos dados em 08/08/2026,
 *   pedido LP1-MHPM3-AM7J4). Nesse caso "Valor dos Itens" já vem como o
 *   total do pedido (repetido em cada linha) — o valor financeiro do
 *   pedido é contado 1x (nunca por item), mas cada linha é um aluno
 *   diferente e TODOS contam para "alunos com pré-matrícula". Por isso
 *   `Pedido` não guarda "o aluno" — guarda `itens`, e quem precisa do
 *   aluno itera por item.
 *
 * - COLUNAS COM NOMES DIFERENTES ENTRE FORMATOS DE EXPORT: o export por
 *   unidade usa "Status do Pagamento"; o export consolidado "Matriz" usa
 *   "Status da Venda" para o mesmo conceito (mesmos valores possíveis,
 *   como "Pago"/"Em aberto"). O parser lê os dois nomes de coluna,
 *   preferindo "Status do Pagamento" quando ambos existirem.
 *
 * - TENTATIVA VENCIDA SUBSTITUÍDA POR PAGAMENTO POSTERIOR (regra de
 *   negócio explícita, pedida pelo usuário): quando o MESMO aluno (mesma
 *   alunoKey) tem um pedido com status pendente/vencido e outro pedido
 *   com status pago, o pedido pendente/vencido é descartado por completo
 *   (não entra em "pedidos", "valor vendido", "valor pendente" nem na
 *   tabela de alunos) — ele é tratado como uma tentativa de checkout
 *   abandonada/expirada que foi substituída pela matrícula paga, não como
 *   uma venda adicional. Caso real que motivou a regra: aluno "Breno
 *   Henrique Boaventura Barcellos casemiro" (Tijuca) tinha um pedido
 *   `Vencido` às 10:30 e outro `Pago` às 12:09 no mesmo dia — sem esta
 *   regra, o pedido vencido ainda contava em "Pedidos" e "Pendente/
 *   vencido" mesmo após o pagamento ter sido concluído. O descarte é
 *   registrado como alerta `pedido_pendente_substituido_por_pago` para
 *   manter rastreabilidade. Escopo deliberadamente limitado a
 *   pendente/vencido — pedidos cancelados/estornados do mesmo aluno NÃO
 *   são descartados por esta regra (não foi pedido, e esconderiam
 *   histórico de cancelamento/estorno relevante).
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

    const nomeMarketplace = (row["Nome do Marketplace"] || "").trim();
    const unitFromMarketplace = identifyUnitByChannel(nomeMarketplace);
    if (unit && unitFromMarketplace && unit.slug !== unitFromMarketplace.slug) {
      issues.push({
        tipo: "unidade_marketplace_canal_divergentes",
        descricao: `"Nome do Canal" indica "${unit.nome}", mas "Nome do Marketplace" ("${nomeMarketplace}") indica "${unitFromMarketplace.nome}". Mantida a classificação por canal; revisar manualmente.`,
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

    // "Status do Pagamento" (export por unidade) e "Status da Venda" (export
    // consolidado "Matriz") são o mesmo conceito com nomes de coluna
    // diferentes — ver nota no topo do arquivo.
    const statusPagamentoRaw = (
      row["Status do Pagamento"] || row["Status da Venda"] || ""
    ).trim();
    if (!statusPagamentoRaw) {
      issues.push({
        tipo: "status_pagamento_ausente",
        descricao: "Status do Pagamento/Status da Venda vazio.",
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
      categoria: (row["Categoria"] || "").trim(),
      nomeMarketplace,
      codigoPedidoAlt: (row["Código do Pedido"] || "").trim() || null,
    });
  });

  return items;
}

function dedupeItems(
  items: ItemVenda[],
  issues: DataQualityIssue[],
): ItemVenda[] {
  // A chave inclui alunoKey para não confundir uma linha genuinamente
  // duplicada (mesmo pedido re-exportado) com um pedido legítimo de
  // múltiplos alunos que compartilha SKU e link de acompanhamento (ex.:
  // gêmeos comprados no mesmo checkout — caso real: pedido
  // LP1-MHPM3-AM7J4, "Rafael" e "Gabriel" Christianes). Sem alunoKey na
  // chave, esse caso seria colapsado incorretamente em 1 aluno só.
  const seen = new Map<string, ItemVenda>();
  for (const item of items) {
    const key = `${item.codigoVenda}::${item.skuItem || item.nomeItem}::${item.linkAcompanhamento}::${item.alunoKey}`;
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

/**
 * Descarta pedidos pendentes/vencidos de um aluno quando esse mesmo aluno
 * já tem um pedido pago — ver docstring "TENTATIVA VENCIDA SUBSTITUÍDA POR
 * PAGAMENTO POSTERIOR" no topo do arquivo. Roda por item (não por pedido)
 * porque um pedido pode ter vários alunos; só o item do aluno substituído
 * é removido, preservando os demais itens do mesmo pedido, se houver.
 */
export function dropSupersededPendingItems(
  items: ItemVenda[],
  issues: DataQualityIssue[],
): ItemVenda[] {
  const alunoKeysComPagamento = new Set(
    items.filter((i) => i.statusBucket === "pago").map((i) => i.alunoKey),
  );

  return items.filter((item) => {
    const substituido =
      item.statusBucket === "pendente_vencido" &&
      alunoKeysComPagamento.has(item.alunoKey);
    if (substituido) {
      issues.push({
        tipo: "pedido_pendente_substituido_por_pago",
        descricao: `Pedido pendente/vencido do aluno "${item.alunoNome ?? item.alunoKey}" descartado das contagens: o mesmo aluno já tem um pedido pago (tratado como tentativa anterior substituída, não como venda adicional).`,
        arquivoOrigem: item.arquivoOrigem,
        linha: item.linhaOrigem,
        codigoVenda: item.codigoVenda,
      });
    }
    return !substituido;
  });
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
    // Nota: um pedido pode legitimamente ter mais de um aluno (checkout
    // único com N pré-matrículas — ver docstring no topo do arquivo). Isso
    // não é tratado como inconsistência; cada item mantém seu próprio
    // aluno e quem precisa do aluno itera `pedido.itens`.

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
      for (const item of pedido.itens) {
        alunosValidos.add(item.alunoKey);
      }
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
  allItems = dropSupersededPendingItems(allItems, issues);
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
