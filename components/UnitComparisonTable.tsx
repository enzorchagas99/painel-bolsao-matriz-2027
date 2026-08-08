"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { UnitKpi } from "@/lib/types";
import { formatBRL } from "@/lib/normalize";

type SortKey =
  | "nome"
  | "alunosPreMatricula"
  | "pedidos"
  | "valorVendidoBruto"
  | "valorPago"
  | "valorPendenteVencido"
  | "ticketMedioPago"
  | "taxaPagamentoPct";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "nome", label: "Unidade" },
  { key: "alunosPreMatricula", label: "Alunos", numeric: true },
  { key: "pedidos", label: "Pedidos", numeric: true },
  { key: "valorVendidoBruto", label: "Valor vendido", numeric: true },
  { key: "valorPago", label: "Valor pago", numeric: true },
  { key: "valorPendenteVencido", label: "Pendente/vencido", numeric: true },
  { key: "ticketMedioPago", label: "Ticket médio", numeric: true },
  { key: "taxaPagamentoPct", label: "% pago", numeric: true },
];

export function UnitComparisonTable({ units }: { units: UnitKpi[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("valorVendidoBruto");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...units];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv, "pt-BR")
          : Number(av) - Number(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [units, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="overflow-x-auto rounded-[10px] border border-line-soft bg-white shadow-soft">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-soft bg-paper-2 text-left">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`select-none whitespace-nowrap px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.06em] text-ink-2 ${col.numeric ? "text-right" : "text-left"}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(col.key)}
                  className={`inline-flex items-center gap-1 hover:text-brand-orange-dark ${col.numeric ? "flex-row-reverse" : ""}`}
                >
                  {col.label}
                  {sortKey === col.key ? (
                    sortDir === "asc" ? (
                      <ArrowUp size={13} />
                    ) : (
                      <ArrowDown size={13} />
                    )
                  ) : (
                    <ArrowUpDown size={13} className="opacity-40" />
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((unit) => (
            <tr
              key={unit.slug}
              className="border-b border-line-soft last:border-0 hover:bg-paper-2"
            >
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">
                {unit.slug === "geral" || unit.slug === "nao-identificada" ? (
                  unit.nome
                ) : (
                  <Link
                    href={`/unidade/${unit.slug}`}
                    className="text-brand-teal-dark hover:text-brand-orange-dark hover:underline"
                  >
                    {unit.nome}
                  </Link>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {unit.alunosPreMatricula}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{unit.pedidos}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatBRL(unit.valorVendidoBruto)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-sem-green">
                {formatBRL(unit.valorPago)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-brand-orange-dark">
                {formatBRL(unit.valorPendenteVencido)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatBRL(unit.ticketMedioPago)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {unit.taxaPagamentoPct.toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
