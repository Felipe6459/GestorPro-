import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { updateInvoiceAction } from "./actions";
import { InvoiceAttachmentsSection } from "./attachments-section";

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await getCurrentUserOrganization();

  const [invoice, projects] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id, organizationId, project: { organizationId } },
    }),
    prisma.project.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, client: { select: { name: true } } },
    }),
  ]);

  if (!invoice) {
    notFound();
  }

  const boundUpdateInvoiceAction = updateInvoiceAction.bind(null, invoice.id);

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Edit invoice
        </h1>
        <Link
          href="/invoices"
          className="rounded text-sm text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          Cancel
        </Link>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <InvoiceForm
          action={boundUpdateInvoiceAction}
          projects={projects.map((project) => ({
            id: project.id,
            label: `${project.name} — ${project.client.name}`,
          }))}
          defaultValues={{
            invoiceNumber: invoice.invoiceNumber,
            projectId: invoice.projectId,
            amount: invoice.amount.toString(),
            status: invoice.status,
            dueDate: toDateInputValue(invoice.dueDate),
            notes: invoice.notes ?? "",
          }}
          submitLabel="Save changes"
          pendingLabel="Saving…"
        />
        <InvoiceAttachmentsSection invoiceId={invoice.id} organizationId={organizationId} />
      </div>
    </div>
  );
}
