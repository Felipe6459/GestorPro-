import { ReactNode } from "react";
import { InboxIcon } from "@/components/ui/icons";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    // Design System page migration Batch 1 — bg-surface added: found while
    // auditing Clients/Team's own empty states (rendered directly on the
    // still-unmigrated page shell, not inside any card). This container
    // previously had no background fill at all (border-dashed only), so
    // its own already-migrated text-text-primary/text-text-muted (Phase
    // 2) composited against whatever ambient background happened to be
    // behind it — on the still-raw page shell, that meant light-in-dark
    // text over a still-light background. An opaque surface here is
    // self-contained and safe regardless of what any caller's own
    // migration status is, unlike the page shell itself.
    <div className="border-border-strong bg-surface mt-10 flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <InboxIcon className="text-text-muted h-10 w-10" />
      <p className="text-text-primary mt-4 text-sm font-medium">{title}</p>
      <p className="text-text-muted mt-1 text-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
