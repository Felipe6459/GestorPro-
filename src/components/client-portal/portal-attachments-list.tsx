import { formatFileSize } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTION_LINK_CLASSES } from "@/components/ui/action-link-classes";
import type { PortalAttachment } from "@/lib/client-portal/attachments";

// Read-only by design: no upload form, no delete button, and never a
// staff uploader name/email, storage bucket, or storage path — those
// never leave the query layer. The Download link always points at the
// portal-specific route, never /api/attachments/... (the staff one).
export function PortalAttachmentsList({
  attachments,
  emptyDescription,
}: {
  attachments: PortalAttachment[];
  emptyDescription: string;
}) {
  if (attachments.length === 0) {
    return <EmptyState title="No files yet" description={emptyDescription} />;
  }

  return (
    <ul className="divide-border-default border-border-default mt-4 divide-y rounded-lg border">
      {attachments.map((attachment) => (
        <li
          key={attachment.id}
          className="flex items-center justify-between gap-4 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-text-primary truncate text-sm font-medium" title={attachment.originalName}>
              {attachment.originalName}
            </p>
            <p className="text-text-muted text-xs">
              {formatFileSize(attachment.sizeBytes)} ·{" "}
              {attachment.createdAt.toLocaleDateString()}
            </p>
          </div>
          <a
            href={`/api/portal/attachments/${attachment.id}/download`}
            className={`shrink-0 ${ACTION_LINK_CLASSES}`}
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}
