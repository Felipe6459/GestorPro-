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
    <div className="border-border-strong mt-10 flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <InboxIcon className="text-text-muted h-10 w-10" />
      <p className="text-text-primary mt-4 text-sm font-medium">{title}</p>
      <p className="text-text-muted mt-1 text-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
