import { formatCurrency, formatStatusLabel } from "@/lib/format";
import type { ActivityAction, ActivityEntityType } from "@/generated/prisma/enums";

export type ActivityDisplayModel = {
  actorLabel: string;
  actionLabel: string;
  entityLabel: string | null;
  detailLines: string[];
  timestamp: Date;
  isDeleted: boolean;
};

export type ActivityFormatInput = {
  entityType: ActivityEntityType;
  action: ActivityAction;
  metadata: unknown;
  actor: { name: string; email: string } | null;
  createdAt: Date;
};

// Only known-safe field names ever get a human label — anything else
// (there shouldn't be anything else, but metadata is never trusted blindly)
// falls back to its raw name rather than being dropped.
const FIELD_LABELS: Record<string, string> = {
  name: "name",
  email: "email",
  phone: "phone",
  company: "company",
  status: "status",
  clientId: "client",
  projectId: "project",
  startDate: "start date",
  endDate: "end date",
  dueDate: "due date",
  title: "title",
  priority: "priority",
  invoiceNumber: "invoice number",
  amount: "amount",
};

function humanizeFieldName(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function numeric(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

type PartialModel = Pick<ActivityDisplayModel, "actionLabel" | "entityLabel" | "detailLines">;

const FALLBACK: PartialModel = {
  actionLabel: "Activity recorded",
  entityLabel: null,
  detailLines: [],
};

function isDataEntity(entityType: ActivityEntityType): boolean {
  return (
    entityType === "CLIENT" ||
    entityType === "PROJECT" ||
    entityType === "TASK" ||
    entityType === "INVOICE"
  );
}

function entityNoun(entityType: ActivityEntityType): string {
  switch (entityType) {
    case "CLIENT":
      return "client";
    case "PROJECT":
      return "project";
    case "TASK":
      return "task";
    case "INVOICE":
      return "invoice";
    default:
      return "";
  }
}

function nameField(entityType: ActivityEntityType): string {
  if (entityType === "TASK") return "title";
  if (entityType === "INVOICE") return "invoiceNumber";
  return "name";
}

function buildDataEntityModel(
  entityType: ActivityEntityType,
  action: ActivityAction,
  metadata: Record<string, unknown>,
): PartialModel {
  const noun = entityNoun(entityType);
  const name = str(metadata[nameField(entityType)]);
  if (!name) return FALLBACK;

  if (action === "CREATED" || action === "DELETED") {
    const verb = action === "CREATED" ? "created" : "deleted";
    const detailLines: string[] = [];
    if (entityType === "INVOICE") {
      const amount = numeric(metadata.amount);
      const currency = str(metadata.currency) ?? "USD";
      if (amount !== null) detailLines.push(formatCurrency(amount, currency));
    }
    return { actionLabel: `${verb} ${noun} ${name}`, entityLabel: name, detailLines };
  }

  if (action === "STATUS_CHANGED") {
    const from = str(metadata.from);
    const to = str(metadata.to);
    if (!from || !to) return FALLBACK;
    return {
      actionLabel: `changed ${noun} ${name} status`,
      entityLabel: name,
      detailLines: [`${formatStatusLabel(from)} → ${formatStatusLabel(to)}`],
    };
  }

  if (action === "UPDATED") {
    const changedFields = strList(metadata.changedFields);
    const detailLines =
      changedFields.length > 0
        ? [`Changed: ${changedFields.map(humanizeFieldName).join(", ")}`]
        : [];
    return { actionLabel: `updated ${noun} ${name}`, entityLabel: name, detailLines };
  }

  return FALLBACK;
}

function buildInvitationModel(
  action: ActivityAction,
  metadata: Record<string, unknown>,
): PartialModel {
  const email = str(metadata.email);
  if (!email) return FALLBACK;
  const role = str(metadata.role);
  const roleLabel = formatStatusLabel(role ?? "MEMBER");

  switch (action) {
    case "INVITATION_SENT":
      return { actionLabel: `invited ${email} as ${roleLabel}`, entityLabel: email, detailLines: [] };
    case "INVITATION_RESENT":
      return {
        actionLabel: `resent an invitation to ${email}`,
        entityLabel: email,
        detailLines: [],
      };
    case "INVITATION_CANCELED":
      return {
        actionLabel: `canceled the invitation for ${email}`,
        entityLabel: email,
        detailLines: [],
      };
    case "INVITATION_ACCEPTED":
      return {
        actionLabel: `accepted an invitation as ${roleLabel}`,
        entityLabel: email,
        detailLines: [],
      };
    default:
      return FALLBACK;
  }
}

function buildMembershipModel(
  action: ActivityAction,
  metadata: Record<string, unknown>,
): PartialModel {
  if (action === "ROLE_CHANGED") {
    const memberName = str(metadata.memberName);
    const from = str(metadata.from);
    const to = str(metadata.to);
    if (!memberName || !from || !to) return FALLBACK;
    return {
      actionLabel: `changed ${memberName}'s role`,
      entityLabel: memberName,
      detailLines: [`${formatStatusLabel(from)} → ${formatStatusLabel(to)}`],
    };
  }

  if (action === "OWNERSHIP_TRANSFERRED") {
    const previousOwnerName = str(metadata.previousOwnerName);
    const newOwnerName = str(metadata.newOwnerName);
    if (!previousOwnerName || !newOwnerName) return FALLBACK;
    return {
      actionLabel: "transferred ownership",
      entityLabel: newOwnerName,
      detailLines: [`${previousOwnerName} → ${newOwnerName}`],
    };
  }

  if (action === "MEMBER_REMOVED") {
    const memberName = str(metadata.memberName);
    if (!memberName) return FALLBACK;
    return {
      actionLabel: `removed ${memberName} from the organization`,
      entityLabel: memberName,
      detailLines: [],
    };
  }

  if (action === "MEMBER_LEFT") {
    // Self-referential — actorLabel already names this same person.
    return { actionLabel: "left the organization", entityLabel: str(metadata.memberName), detailLines: [] };
  }

  return FALLBACK;
}

function buildModel(
  entityType: ActivityEntityType,
  action: ActivityAction,
  metadata: Record<string, unknown>,
): PartialModel {
  if (isDataEntity(entityType)) return buildDataEntityModel(entityType, action, metadata);
  if (entityType === "INVITATION") return buildInvitationModel(action, metadata);
  if (entityType === "MEMBERSHIP") return buildMembershipModel(action, metadata);
  return FALLBACK;
}

/**
 * Converts a raw Activity row into a safe display model. Never throws and
 * never renders metadata directly — every field is read defensively, and
 * anything missing/malformed falls back to a neutral "Activity recorded"
 * line rather than crashing the page.
 */
export function formatActivity(input: ActivityFormatInput): ActivityDisplayModel {
  const metadata = isRecord(input.metadata) ? input.metadata : {};
  const actorLabel = input.actor?.name || str(metadata.actorName) || "Unknown user";
  const isDeleted = input.action === "DELETED";

  let partial: PartialModel;
  try {
    partial = buildModel(input.entityType, input.action, metadata);
  } catch {
    partial = FALLBACK;
  }

  return { ...partial, actorLabel, timestamp: input.createdAt, isDeleted };
}
