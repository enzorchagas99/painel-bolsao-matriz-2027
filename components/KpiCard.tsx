import type { LucideIcon } from "lucide-react";

type Tone = "orange" | "teal" | "green" | "ink" | "red";

const TONE_BG: Record<Tone, string> = {
  orange: "bg-brand-orange",
  teal: "bg-brand-teal-dark",
  green: "bg-sem-green",
  ink: "bg-ink-2",
  red: "bg-sem-red",
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "ink",
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div
      className={`flex flex-col justify-between gap-4 rounded-[10px] p-6 text-white shadow-soft ${TONE_BG[tone]}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-white/80">
          {label}
        </span>
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/18">
          <Icon size={22} strokeWidth={2} />
        </span>
      </div>
      <div>
        <div className="font-display text-[32px] font-extrabold leading-none tracking-tight">
          {value}
        </div>
        {hint ? <p className="mt-2 text-xs text-white/80">{hint}</p> : null}
      </div>
    </div>
  );
}
