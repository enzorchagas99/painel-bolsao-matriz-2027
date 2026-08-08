import type { Metadata } from "next";
import { Montserrat, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Painel Bolsão Matriz 2027 — Raiz Educação",
  description:
    "Acompanhamento de vendas e pré-matrículas dos Bolsões Matriz 2027 por unidade.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${montserrat.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <header className="border-b border-line-soft bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
            <Link href="/" className="flex items-baseline gap-3">
              <span className="font-display text-lg font-extrabold uppercase tracking-[0.06em] text-brand-teal-dark">
                Raiz Educação
              </span>
              <span className="h-4 w-px bg-line" />
              <span className="font-display text-base font-bold text-ink">
                Painel Bolsão Matriz 2027
              </span>
            </Link>
            <nav className="flex items-center gap-5 font-display text-sm font-semibold text-ink-2">
              <Link href="/" className="hover:text-brand-orange-dark">
                Visão geral
              </Link>
              <Link href="/metodologia" className="hover:text-brand-orange-dark">
                Metodologia e dados
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line-soft bg-paper-2 px-6 py-4 text-center text-xs text-ink-3">
          Painel interno de acompanhamento comercial — Raiz Educação. Dados
          provenientes dos exports de vendas da plataforma Layers.
        </footer>
      </body>
    </html>
  );
}
