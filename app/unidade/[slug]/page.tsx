import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, ShoppingCart, Wallet, Clock3, TrendingUp, ReceiptText } from "lucide-react";
import { loadDashboardData, buildEvolucaoDiaria } from "@/lib/etl";
import { UNITS, unitBySlug } from "@/lib/units";
import { formatBRL } from "@/lib/normalize";
import { KpiCard } from "@/components/KpiCard";
import { SalesTrendChart } from "@/components/SalesTrendChart";
import { StudentsTable } from "@/components/StudentsTable";

export function generateStaticParams() {
  return UNITS.map((u) => ({ slug: u.slug }));
}

export default async function UnidadePage(props: PageProps<"/unidade/[slug]">) {
  const { slug } = await props.params;
  const unit = unitBySlug(slug);
  if (!unit) notFound();

  const data = loadDashboardData();
  const kpi = data.kpisPorUnidade.find((k) => k.slug === slug);
  const pedidosUnidade = data.pedidos.filter((p) => p.unidadeSlug === slug);
  const evolucao = buildEvolucaoDiaria(pedidosUnidade);

  if (!kpi) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-semibold text-ink-3 hover:text-brand-orange-dark"
        >
          <ArrowLeft size={15} /> Voltar para visão geral
        </Link>
        <p className="mt-3 font-display text-xs font-bold uppercase tracking-[0.12em] text-brand-teal-dark">
          Unidade
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">{unit.nome}</h1>
      </div>

      {pedidosUnidade.length === 0 ? (
        <div className="rounded-[10px] border border-line-soft bg-white p-6 text-sm text-ink-3 shadow-soft">
          Nenhuma venda registrada para esta unidade nos arquivos processados até o momento.
          A unidade é exibida com 0 em todos os indicadores.
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Alunos com pré-matrícula"
          value={kpi.alunosPreMatricula.toLocaleString("pt-BR")}
          icon={Users}
          tone="teal"
          hint="Alunos únicos, exceto cancelados/estornados"
        />
        <KpiCard
          label="Pedidos"
          value={kpi.pedidos.toLocaleString("pt-BR")}
          icon={ShoppingCart}
          tone="ink"
        />
        <KpiCard
          label="Valor vendido"
          value={formatBRL(kpi.valorVendidoBruto)}
          icon={ReceiptText}
          tone="orange"
          hint="Bruto, todos os status"
        />
        <KpiCard
          label="Valor pago"
          value={formatBRL(kpi.valorPago)}
          icon={Wallet}
          tone="green"
          hint={`${kpi.taxaPagamentoPct.toFixed(0)}% do valor vendido`}
        />
        <KpiCard
          label="Pendente / vencido"
          value={formatBRL(kpi.valorPendenteVencido)}
          icon={Clock3}
          tone="ink"
        />
        <KpiCard
          label="Ticket médio pago"
          value={formatBRL(kpi.ticketMedioPago)}
          icon={TrendingUp}
          tone="ink"
        />
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">
          Evolução das vendas — {unit.nome}
        </h2>
        <SalesTrendChart data={evolucao} />
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">
          Alunos e pedidos — {unit.nome}
        </h2>
        <StudentsTable pedidos={pedidosUnidade} showUnidadeColumn={false} />
      </section>
    </div>
  );
}
