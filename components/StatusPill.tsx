import type { StatusBucket } from "@/lib/types";
import { STATUS_BUCKET_COLOR, STATUS_BUCKET_LABEL } from "@/lib/status";

export function StatusPill({ status }: { status: StatusBucket }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.06em] ${STATUS_BUCKET_COLOR[status]}`}
    >
      {STATUS_BUCKET_LABEL[status]}
    </span>
  );
}
