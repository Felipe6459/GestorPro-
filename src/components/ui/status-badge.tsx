import { formatStatusLabel } from "@/lib/format";

type StatusTone = "neutral" | "info" | "warning" | "success" | "danger" | "muted";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-gray-100 text-gray-700",
  info: "bg-blue-100 text-blue-700",
  warning: "bg-amber-100 text-amber-800",
  success: "bg-green-100 text-green-800",
  danger: "bg-red-100 text-red-700",
  muted: "bg-gray-200 text-gray-500",
};

// Shared across ClientStatus, ProjectStatus, TaskStatus, TaskPriority, and
// InvoiceStatus so the same word always renders in the same color everywhere
// (e.g. IN_PROGRESS and CANCELLED mean the same thing on both Project and
// Task/Invoice, so they share one entry).
const STATUS_TONES: Record<string, StatusTone> = {
  LEAD: "neutral",
  ACTIVE: "success",
  INACTIVE: "muted",
  ARCHIVED: "muted",

  PLANNING: "neutral",
  IN_PROGRESS: "info",
  ON_HOLD: "warning",
  COMPLETED: "success",
  CANCELLED: "danger",

  TODO: "neutral",
  IN_REVIEW: "warning",
  DONE: "success",

  DRAFT: "neutral",
  SENT: "info",
  PAID: "success",
  OVERDUE: "danger",

  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? "neutral";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {formatStatusLabel(status)}
    </span>
  );
}
