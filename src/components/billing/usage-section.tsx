import type { UsageRowViewModel } from "@/lib/billing/view-model";
import { UsageRow } from "./usage-row";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";

export function UsageSection({ rows }: { rows: UsageRowViewModel[] }) {
  return (
    <section aria-labelledby="billing-usage-heading" className={`p-5 ${CARD_SURFACE_CLASSES}`}>
      <h2 id="billing-usage-heading" className="text-text-primary text-base font-semibold">
        Usage
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
        {rows.map((row) => (
          <UsageRow key={row.key} row={row} />
        ))}
      </div>
    </section>
  );
}
