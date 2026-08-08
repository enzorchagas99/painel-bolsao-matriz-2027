"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { ItemVenda, Pedido, StatusBucket } from "@/lib/types";
import { formatBRL, formatDateBR, formatDateTimeBR } from "@/lib/normalize";
import { STATUS_BUCKET_LABEL } from "@/lib/status";
import { StatusPill } from "./StatusPill";

type SortKey = "data" | "aluno" | "valor" | "status";

const PAGE_SIZE = 50;

/** Uma linha da tabela = um aluno (um item dentro de um pedido). Um pedido
 * com N alunos gera N linhas — ver docstring sobre pedidos multi-aluno em
 * lib/etl.ts. */
interface Row {
  pedido: Pedido;
  item: ItemVenda;
  /** valor exibido para este aluno: valor do pedido dividido pelo número de
   * alunos do mesmo pedido, para não sugerir que a soma da coluna é maior
   * que o valor realmente cobrado. */
  valorRateado: number;
  totalAlunosNoPedido: number;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function buildRows(pedidos: Pedido[]): Row[] {
  const rows: Row[] = [];
  for (const pedido of pedidos) {
    const total = pedido.itens.length || 1;
    for (const item of pedido.itens) {
      rows.push({
        pedido,
        item,
        valorRateado: pedido.valorPedido / total,
        totalAlunosNoPedido: total,
      });
    }
  }
  return rows;
}

export function StudentsTable({
  pedidos,
  showUnidadeColumn,
  unidadeOptions,
}: {
  pedidos: Pedido[];
  showUnidadeColumn: boolean;
  unidadeOptions?: { slug: string; nome: string }[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusBucket | "todos">("todos");
  const [unidadeFilter, setUnidadeFilter] = useState<string>("todas");
  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const allRows = useMemo(() => buildRows(pedidos), [pedidos]);

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    return allRows.filter(({ pedido, item }) => {
      if (statusFilter !== "todos" && pedido.statusBucket !== statusFilter) return false;
      if (unidadeFilter !== "todas" && pedido.unidadeSlug !== unidadeFilter) return false;
      if (!term) return true;
      const haystack = normalize(
        [
          item.alunoNome ?? "",
          item.alunoResponsavelNome ?? "",
          item.clienteNome ?? "",
          item.clienteEmail ?? "",
          item.clienteCpf ?? "",
          pedido.codigoVenda,
          pedido.unidadeNome ?? "",
        ].join(" "),
      );
      return haystack.includes(term);
    });
  }, [allRows, search, statusFilter, unidadeFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "data":
          cmp = (a.pedido.dataVenda?.getTime() ?? 0) - (b.pedido.dataVenda?.getTime() ?? 0);
          break;
        case "aluno":
          cmp = (a.item.alunoNome ?? "").localeCompare(b.item.alunoNome ?? "", "pt-BR");
          break;
        case "valor":
          cmp = a.valorRateado - b.valorRateado;
          break;
        case "status":
          cmp = a.pedido.statusBucket.localeCompare(b.pedido.statusBucket);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const visible = sorted.slice(0, visibleCount);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "aluno" ? "asc" : "desc");
    }
  }

  function rowKey(row: Row): string {
    return `${row.item.arquivoOrigem}::${row.item.linhaOrigem}`;
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="rounded-[10px] border border-line-soft bg-white shadow-soft">
      <div className="flex flex-wrap items-center gap-3 border-b border-line-soft p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Buscar por aluno, responsável, e-mail, CPF ou código do pedido"
            className="w-full rounded-[6px] border border-line py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand-teal-dark focus:outline-none focus:ring-2 focus:ring-brand-teal-soft"
          />
        </div>

        {showUnidadeColumn && unidadeOptions ? (
          <select
            value={unidadeFilter}
            onChange={(e) => {
              setUnidadeFilter(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            className="rounded-[6px] border border-line px-3 py-2 text-sm text-ink focus:border-brand-teal-dark focus:outline-none"
          >
            <option value="todas">Todas as unidades</option>
            {unidadeOptions.map((u) => (
              <option key={u.slug} value={u.slug}>
                {u.nome}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusBucket | "todos");
            setVisibleCount(PAGE_SIZE);
          }}
          className="rounded-[6px] border border-line px-3 py-2 text-sm text-ink focus:border-brand-teal-dark focus:outline-none"
        >
          <option value="todos">Todos os status</option>
          {(Object.keys(STATUS_BUCKET_LABEL) as StatusBucket[]).map((key) => (
            <option key={key} value={key}>
              {STATUS_BUCKET_LABEL[key]}
            </option>
          ))}
        </select>

        <span className="text-xs text-ink-3" title="Uma linha por aluno/pedido — pode diferir do KPI 'Alunos com pré-matrícula', que deduplica o mesmo aluno em múltiplas tentativas de compra.">
          {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-soft bg-paper-2 text-left">
              <th className="w-8 px-3 py-3" />
              <SortableHeader label="Aluno" active={sortKey === "aluno"} dir={sortDir} onClick={() => toggleSort("aluno")} />
              {showUnidadeColumn ? (
                <th className="px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">
                  Unidade
                </th>
              ) : null}
              <th className="px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">
                Série pretendida
              </th>
              <SortableHeader label="Data" active={sortKey === "data"} dir={sortDir} onClick={() => toggleSort("data")} align="right" />
              <SortableHeader label="Valor" active={sortKey === "valor"} dir={sortDir} onClick={() => toggleSort("valor")} align="right" />
              <SortableHeader label="Status" active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")} />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const key = rowKey(row);
              return (
                <FragmentRow
                  key={key}
                  row={row}
                  isOpen={expanded.has(key)}
                  onToggle={() => toggleExpand(key)}
                  showUnidadeColumn={showUnidadeColumn}
                />
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={showUnidadeColumn ? 7 : 6}
                  className="px-4 py-10 text-center text-sm text-ink-3"
                >
                  Nenhum registro encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {visibleCount < sorted.length ? (
        <div className="flex justify-center border-t border-line-soft p-3">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="rounded-[6px] border border-line px-4 py-2 text-sm font-semibold text-ink-2 hover:border-brand-teal-dark hover:text-brand-teal-dark"
          >
            Carregar mais ({sorted.length - visibleCount} restantes)
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.06em] text-ink-2 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-brand-orange-dark ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <span className={`text-[10px] ${active ? "opacity-100" : "opacity-30"}`}>
          {dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

function FragmentRow({
  row,
  isOpen,
  onToggle,
  showUnidadeColumn,
}: {
  row: Row;
  isOpen: boolean;
  onToggle: () => void;
  showUnidadeColumn: boolean;
}) {
  const { pedido, item, valorRateado, totalAlunosNoPedido } = row;
  const outrosAlunos = pedido.itens.filter((i) => i !== item);

  return (
    <>
      <tr className="border-b border-line-soft last:border-0 hover:bg-paper-2">
        <td className="px-3 py-3">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Ver detalhes"
            className="flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-line-soft hover:text-ink"
          >
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="px-4 py-3 font-medium text-ink">
          {item.alunoNome ?? <span className="italic text-ink-3">não identificado</span>}
        </td>
        {showUnidadeColumn ? (
          <td className="px-4 py-3 text-ink-2">
            {pedido.unidadeNome ?? (
              <span className="italic text-sem-purple">não identificada</span>
            )}
          </td>
        ) : null}
        <td className="px-4 py-3 text-ink-2">{item.seriePretendida ?? "—"}</td>
        <td className="px-4 py-3 text-right tabular-nums text-ink-2">
          {formatDateBR(pedido.dataVenda)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums font-medium text-ink">
          {formatBRL(valorRateado)}
          {totalAlunosNoPedido > 1 ? (
            <span className="ml-1 text-[10px] font-normal text-ink-3">
              (1/{totalAlunosNoPedido} do pedido)
            </span>
          ) : null}
        </td>
        <td className="px-4 py-3">
          <StatusPill status={pedido.statusBucket} />
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-b border-line-soft bg-paper-2/60 last:border-0">
          <td />
          <td colSpan={showUnidadeColumn ? 6 : 5} className="px-4 py-4">
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-xs text-ink-2 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Código do pedido" value={pedido.codigoVenda} mono />
              <Detail label="Código do pedido (alt.)" value={item.codigoPedidoAlt ?? "—"} mono />
              <Detail label="ID da transação" value={item.transacaoId ?? "—"} mono />
              <Detail label="Produto" value={item.nomeItem || "—"} />
              <Detail
                label="Data/hora da venda"
                value={formatDateTimeBR(pedido.dataVenda)}
              />
              <Detail label="Série atual" value={item.serieAtual ?? "—"} />
              <Detail label="Série pretendida (2027)" value={item.seriePretendida ?? "—"} />
              <Detail
                label="Valor total do pedido"
                value={`${formatBRL(pedido.valorPedido)}${totalAlunosNoPedido > 1 ? ` (dividido entre ${totalAlunosNoPedido} alunos)` : ""}`}
              />
              <Detail
                label="Método de pagamento"
                value={`${item.metodoPagamento || "—"}${item.bandeiraCartao ? ` (${item.bandeiraCartao})` : ""}${item.numeroParcelas ? ` · ${item.numeroParcelas}x` : ""}`}
              />
              <Detail label="Status original (Layers)" value={item.statusPagamentoRaw || "—"} />
              <Detail label="Data de nascimento do aluno" value={item.alunoDataNascimentoRaw ?? "—"} />
              <Detail label="Responsável" value={item.alunoResponsavelNome ?? item.clienteNome} />
              <Detail label="Telefone do responsável" value={item.alunoResponsavelTelefone ?? item.clienteTelefone} />
              <Detail label="E-mail do responsável" value={item.clienteEmail || "—"} />
              <Detail label="CPF do responsável" value={item.clienteCpf || "—"} mono />
              <Detail label="Endereço" value={item.clienteEndereco || "—"} className="sm:col-span-2 lg:col-span-3" />
              <Detail label="Unidade (canal original)" value={item.canalOriginal || "—"} />
              <Detail label="Unidade (marketplace)" value={item.nomeMarketplace || "—"} />
              {outrosAlunos.length > 0 ? (
                <Detail
                  label="Outros alunos neste mesmo pedido"
                  value={outrosAlunos.map((i) => i.alunoNome ?? "não identificado").join(", ")}
                  className="sm:col-span-2 lg:col-span-3"
                />
              ) : null}
              <Detail label="Arquivo de origem" value={`${item.arquivoOrigem} · linha ${item.linhaOrigem}`} mono className="sm:col-span-2 lg:col-span-3" />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Detail({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </div>
      <div className={`mt-0.5 break-words text-ink ${mono ? "font-mono text-[11px]" : ""}`}>
        {value}
      </div>
    </div>
  );
}
