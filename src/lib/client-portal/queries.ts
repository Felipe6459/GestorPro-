import { prisma } from "@/lib/prisma";
import type { ProjectStatus, InvoiceStatus } from "@/generated/prisma/enums";

// Same definition the staff Dashboard KPI already uses for "active
// projects" (src/app/(dashboard)/dashboard/query.ts) — kept identical so
// the word means the same thing in both places.
const ACTIVE_PROJECT_STATUS: ProjectStatus = "IN_PROGRESS";

// PAID and CANCELLED are deliberately excluded from "open" — an invoice
// the client no longer owes money on, or one that was called off, isn't
// outstanding work.
const OPEN_INVOICE_STATUSES: readonly InvoiceStatus[] = ["DRAFT", "SENT", "OVERDUE"];

export const PORTAL_INVOICE_FILTERS = ["all", "open", "paid"] as const;
export type PortalInvoiceFilter = (typeof PORTAL_INVOICE_FILTERS)[number];

/** Invalid/missing filter values always fall back to "all", never an error. */
export function parsePortalInvoiceFilter(raw: string | undefined): PortalInvoiceFilter {
  return (PORTAL_INVOICE_FILTERS as readonly string[]).includes(raw ?? "")
    ? (raw as PortalInvoiceFilter)
    : "all";
}

export type PortalProjectSummary = {
  id: string;
  name: string;
  status: ProjectStatus;
  startDate: Date | null;
  endDate: Date | null;
};

export type PortalProjectDetail = PortalProjectSummary & {
  /** Project.description — a client-facing work summary (see seed.ts's own
   * usage, e.g. "Full redesign of the marketing site and blog."), never
   * Project.budget or any staff-internal field. */
  description: string | null;
  clientName: string;
};

export type PortalInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  projectName: string;
  issueDate: Date;
  dueDate: Date | null;
  amount: number;
  currency: string;
  status: InvoiceStatus;
};

export type PortalInvoiceDetail = PortalInvoiceSummary & {
  paidAt: Date | null;
  clientName: string;
};

export type PortalOverview = {
  activeProjectsCount: number;
  openInvoicesCount: number;
  outstandingAmount: number;
  recentProjects: PortalProjectSummary[];
  recentInvoices: PortalInvoiceSummary[];
};

const PROJECT_SUMMARY_SELECT = {
  id: true,
  name: true,
  status: true,
  startDate: true,
  endDate: true,
} as const;

const INVOICE_SUMMARY_SELECT = {
  id: true,
  invoiceNumber: true,
  issueDate: true,
  dueDate: true,
  amount: true,
  currency: true,
  status: true,
  project: { select: { name: true } },
} as const;

function toInvoiceSummary(invoice: {
  id: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  amount: unknown;
  currency: string;
  status: InvoiceStatus;
  project: { name: string };
}): PortalInvoiceSummary {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    projectName: invoice.project.name,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    amount: Number(invoice.amount),
    currency: invoice.currency,
    status: invoice.status,
  };
}

/**
 * All Client Portal reads are scoped by clientId alone — the caller must
 * always pass the clientId that getCurrentPortalUser()/getOptionalPortalUser()
 * resolved for the current identity, never a value from a query string,
 * form field, or cookie. No caching layer sits in front of any of these.
 */
export async function getPortalOverview(clientId: string): Promise<PortalOverview> {
  const [activeProjectsCount, openInvoicesAgg, recentProjects, recentInvoices] =
    await Promise.all([
      prisma.project.count({ where: { clientId, status: ACTIVE_PROJECT_STATUS } }),
      prisma.invoice.aggregate({
        where: { clientId, status: { in: [...OPEN_INVOICE_STATUSES] } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.project.findMany({
        where: { clientId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: PROJECT_SUMMARY_SELECT,
      }),
      prisma.invoice.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: INVOICE_SUMMARY_SELECT,
      }),
    ]);

  return {
    activeProjectsCount,
    openInvoicesCount: openInvoicesAgg._count._all,
    outstandingAmount: Number(openInvoicesAgg._sum.amount ?? 0),
    recentProjects,
    recentInvoices: recentInvoices.map(toInvoiceSummary),
  };
}

export async function getPortalProjects(clientId: string): Promise<PortalProjectSummary[]> {
  return prisma.project.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
    select: PROJECT_SUMMARY_SELECT,
  });
}

/**
 * Scoped by id + clientId together — a foreign Client's (or foreign
 * organization's) project id simply doesn't match, indistinguishable from
 * a nonexistent one. Callers must notFound() on null, never fall back to
 * a bare id lookup.
 */
export async function getPortalProject(
  clientId: string,
  projectId: string,
): Promise<PortalProjectDetail | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, clientId },
    select: { ...PROJECT_SUMMARY_SELECT, description: true, client: { select: { name: true } } },
  });

  if (!project) return null;

  return {
    id: project.id,
    name: project.name,
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    description: project.description,
    clientName: project.client.name,
  };
}

export async function getPortalInvoices(
  clientId: string,
  filter: PortalInvoiceFilter,
): Promise<PortalInvoiceSummary[]> {
  const statusWhere =
    filter === "open"
      ? { in: [...OPEN_INVOICE_STATUSES] }
      : filter === "paid"
        ? ("PAID" as const)
        : undefined;

  const invoices = await prisma.invoice.findMany({
    where: {
      clientId,
      ...(statusWhere ? { status: statusWhere } : {}),
      // Defense in depth beyond Invoice.clientId (the primary boundary):
      // also require the invoice's own project to belong to this same
      // Client, in case the two ever disagree.
      project: { clientId },
    },
    orderBy: { createdAt: "desc" },
    select: INVOICE_SUMMARY_SELECT,
  });

  return invoices.map(toInvoiceSummary);
}

/**
 * Scoped by id + clientId + project.clientId together — same reasoning as
 * getPortalProject. Callers must notFound() on null.
 */
export async function getPortalInvoice(
  clientId: string,
  invoiceId: string,
): Promise<PortalInvoiceDetail | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, clientId, project: { clientId } },
    select: {
      ...INVOICE_SUMMARY_SELECT,
      paidAt: true,
      client: { select: { name: true } },
    },
  });

  if (!invoice) return null;

  return {
    ...toInvoiceSummary(invoice),
    paidAt: invoice.paidAt,
    clientName: invoice.client.name,
  };
}
