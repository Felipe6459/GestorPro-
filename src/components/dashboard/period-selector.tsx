import Link from "next/link";
import { DASHBOARD_PERIOD_OPTIONS, type DashboardPeriod } from "@/lib/dashboard/period";

/**
 * Plain server-rendered links, not a <select>/client component — there are
 * only 4 options and no other query params to preserve, so a real
 * navigation per option is simpler and needs no JS to work at all.
 */
export function PeriodSelector({ period }: { period: DashboardPeriod }) {
  return (
    <div>
      <span id="dashboard-period-label" className="text-text-muted block text-xs font-medium">
        Period
      </span>
      <div
        role="group"
        aria-labelledby="dashboard-period-label"
        className="border-border-default bg-surface mt-1 flex flex-wrap gap-1 rounded-lg border p-1"
      >
        {DASHBOARD_PERIOD_OPTIONS.map((option) => {
          const isActive = option.value === period;
          return (
            <Link
              key={option.value}
              href={option.value === "30d" ? "/dashboard" : `/dashboard?period=${option.value}`}
              aria-current={isActive ? "true" : undefined}
              className={`focus-visible:ring-focus-ring rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                isActive ? "bg-accent text-white" : "text-text-secondary hover:bg-[var(--hover)]"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
      <p className="text-text-muted mt-1 text-xs">
        Only Paid revenue and Revenue over time change with this — everything else always reflects the
        current state.
      </p>
    </div>
  );
}
