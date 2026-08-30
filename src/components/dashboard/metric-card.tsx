import Link from "next/link";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";

export function MetricCard({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string | number;
  href: string;
  /** Small caption under the value — e.g. the period a figure is scoped to. */
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className={`focus-visible:ring-focus-ring block p-5 transition-colors hover:border-border-strong hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${CARD_SURFACE_CLASSES}`}
    >
      <p className="text-text-muted text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="text-text-primary mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {value}
      </p>
      {hint && <p className="text-text-muted mt-1 text-xs">{hint}</p>}
    </Link>
  );
}
