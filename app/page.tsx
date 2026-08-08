import { Users, ShoppingCart, Wallet, Clock3, ReceiptText, TrendingUp } from "lucide-react";
import { loadDashboardData } from "@/lib/etl";
import { UNITS } from "@/lib/units";
import { formatBRL } from "@/lib/normalize";
import { KpiCard } from "@/components/KpiCard";
import { SalesTrendChart } from "@/components/SalesTrendChart";
import { UnitComparisonTable } from "@/components/UnitComparisonTable";
import { StudentsTable } from "@/components/StudentsTable";
import { DataQualityPanel } from "@/components/DataQualityPanel";

export default function OverviewPage() {
  const data = loadDashboardData();
  const { kpiGeral } = data;

  const unidadesParaTabela = data.kpisPorUnidade.filter((u) => u.slug !== "geral");

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <div>
        <p className="font-display text-xs font-bold uppercase tracking-[0.12em] text-brand-teal-dark">
          Visão geral · todas as unidades
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">
          Bolsão Matriz 2027
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          {UNITS.length} unidades acompanhadas · {data.pedidos.length} pedidos processados ·
          atualizado em {new Date(data.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Alunos com pré-matrícula"
          value={kpiGeral.alunosPreMatricula.toLocaleString("pt-BR")}
          icon={Users}
          tone="teal"
          hint="Alunos únicos, exceto cancelados/estornados"
        />
        <KpiCard
          label="Pedidos"
          value={kpiGeral.pedidos.toLocaleString("pt-BR")}
          icon={ShoppingCart}
          tone="ink"
        />
        <KpiCard
          label="Valor vendido"
          value={formatBRL(kpiGeral.valorVendidoBruto)}
          icon={ReceiptText}
          tone="orange"
          hint="Bruto, todos os status"
        />
        <KpiCard
          label="Valor pago"
          value={formatBRL(kpiGeral.valorPago)}
          icon={Wallet}
          tone="green"
          hint={`${kpiGeral.taxaPagamentoPct.toFixed(0)}% do valor vendido`}
        />
        <KpiCard
          label="Pendente / vencido"
          value={formatBRL(kpiGeral.valorPendenteVencido)}
          icon={Clock3}
          tone="ink"
        />
        <KpiCard
          label="Ticket médio pago"
          value={formatBRL(kpiGeral.ticketMedioPago)}
          icon={TrendingUp}
          tone="ink"
        />
      </section>

      {(kpiGeral.valorCancelado > 0 || kpiGeral.valorEstornado > 0) && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-[10px] border border-line-soft bg-white p-4 shadow-soft">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
              Cancelado
            </p>
            <p className="mt-1 font-display text-xl font-bold text-ink">
              {formatBRL(kpiGeral.valorCancelado)}
            </p>
          </div>
          <div className="rounded-[10px] border border-line-soft bg-white p-4 shadow-soft">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
              Estornado
            </p>
            <p className="mt-1 font-display text-xl font-bold text-ink">
              {formatBRL(kpiGeral.valorEstornado)}
            </p>
          </div>
        </section>
      )}

      <DataQualityPanel issues={data.dataQualityIssues} />

      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">
          Evolução das vendas
        </h2>
        <SalesTrendChart data={data.evolucaoDiaria} />
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">
          Comparativo entre unidades
        </h2>
        <UnitComparisonTable units={unidadesParaTabela} />
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">
          Alunos e pedidos — todas as unidades
        </h2>
        <StudentsTable
          pedidos={data.pedidos}
          showUnidadeColumn
          unidadeOptions={UNITS.map((u) => ({ slug: u.slug, nome: u.nome }))}
        />
      </section>
    </div>
  );
}
