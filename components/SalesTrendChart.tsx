"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { EvolucaoDiaria } from "@/lib/types";
import { formatBRL } from "@/lib/normalize";

function formatDiaLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function SalesTrendChart({ data }: { data: EvolucaoDiaria[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[10px] border border-line-soft bg-white text-sm text-ink-3 shadow-soft">
        Sem vendas com data válida para exibir evolução.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatDiaLabel(d.data),
  }));

  return (
    <div className="rounded-[10px] border border-line-soft bg-white p-4 shadow-soft">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#E6E2DB" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "#6B7A7A" }}
            axisLine={{ stroke: "#E6E2DB" }}
            tickLine={false}
          />
          <YAxis
            yAxisId="pedidos"
            tick={{ fontSize: 12, fill: "#6B7A7A" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="valor"
            orientation="right"
            tick={{ fontSize: 12, fill: "#6B7A7A" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatBRL(v)}
          />
          <Tooltip
            formatter={(value, name) =>
              name === "valor"
                ? [formatBRL(Number(value)), "Valor vendido"]
                : [String(value), "Pedidos"]
            }
            labelFormatter={(label) => `Dia ${label}`}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #EFECE5",
              fontSize: 13,
            }}
          />
          <Bar yAxisId="pedidos" dataKey="pedidos" fill="#D6ECEA" radius={[4, 4, 0, 0]} barSize={28} />
          <Line
            yAxisId="valor"
            type="monotone"
            dataKey="valor"
            stroke="#E8862A"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#E8862A" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex justify-center gap-6 text-xs text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-teal-soft" /> Pedidos por dia
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-orange" /> Valor vendido por dia
        </span>
      </div>
    </div>
  );
}
