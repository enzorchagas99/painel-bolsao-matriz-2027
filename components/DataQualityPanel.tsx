"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { DataQualityIssue } from "@/lib/types";

const TIPO_LABEL: Record<string, string> = {
  unidade_nao_identificada: "Unidade não identificada pelo canal de venda",
  unidade_reclassificada_por_canal: "Unidade reclassificada pelo canal (ex.: Américas dentro de Rocha Miranda)",
  aluno_nao_identificado: "Dados do aluno não extraídos do formulário",
  aluno_e_responsavel_nao_identificados: "Nem aluno nem responsável identificados",
  valor_zero_ou_ausente: "Valor do pedido zerado ou ausente",
  data_venda_invalida: "Data da venda inválida",
  formato_data_ambiguo: "Formato de data possivelmente incorreto",
  status_pagamento_ausente: "Status de pagamento ausente",
  status_nao_mapeado: "Status de pagamento não mapeado",
  linha_sem_codigo_venda: "Linha sem código de venda",
  linha_duplicada: "Linha duplicada entre exportações",
  valor_pedido_inconsistente: "Valor divergente entre linhas do mesmo pedido",
  unidade_marketplace_canal_divergentes: "Canal e Marketplace apontam para unidades diferentes",
};

export function DataQualityPanel({ issues }: { issues: DataQualityIssue[] }) {
  const [open, setOpen] = useState(false);

  if (issues.length === 0) {
    return (
      <div className="rounded-[10px] border border-sem-green/30 bg-sem-green-soft px-4 py-3 text-sm text-sem-green">
        Nenhum alerta de qualidade de dados nos arquivos processados atualmente.
      </div>
    );
  }

  const byType = new Map<string, DataQualityIssue[]>();
  for (const issue of issues) {
    const list = byType.get(issue.tipo) ?? [];
    list.push(issue);
    byType.set(issue.tipo, list);
  }

  return (
    <div className="rounded-[10px] border border-brand-orange/30 bg-white shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-orange-dark">
          <AlertTriangle size={18} />
          {issues.length} {issues.length === 1 ? "alerta" : "alertas"} de qualidade de dados
          encontrados nesta carga
        </span>
        {open ? <ChevronUp size={18} className="text-ink-3" /> : <ChevronDown size={18} className="text-ink-3" />}
      </button>
      {open ? (
        <div className="max-h-96 overflow-y-auto border-t border-line-soft px-4 py-3 text-sm">
          {Array.from(byType.entries()).map(([tipo, list]) => (
            <div key={tipo} className="mb-4 last:mb-0">
              <div className="font-display text-xs font-bold uppercase tracking-[0.06em] text-ink-2">
                {TIPO_LABEL[tipo] ?? tipo} ({list.length})
              </div>
              <ul className="mt-1 space-y-1">
                {list.slice(0, 20).map((issue, idx) => (
                  <li key={idx} className="text-xs text-ink-3">
                    <span className="font-mono">
                      {issue.arquivoOrigem}:{issue.linha}
                    </span>
                    {issue.codigoVenda ? (
                      <span className="font-mono"> · {issue.codigoVenda}</span>
                    ) : null}
                    {" — "}
                    {issue.descricao}
                  </li>
                ))}
                {list.length > 20 ? (
                  <li className="text-xs italic text-ink-3">
                    e mais {list.length - 20}...
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
