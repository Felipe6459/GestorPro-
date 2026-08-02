import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentPortalUser } from "@/lib/current-portal-user";
import { getPortalInvoice } from "@/lib/client-portal/queries";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function PortalInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { clientId } = await getCurrentPortalUser();

  // Scoped by id + clientId (+ project.clientId inside the query), never a
  // bare id lookup — an invoice belonging to a different Client simply
  // doesn't match, indistinguishable from a nonexistent id.
  const invoice = await getPortalInvoice(clientId, id);

  if (!invoice) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/portal/invoices"
        className="rounded text-sm text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
      >
        ← Back to invoices
      </Link>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">
            {invoice.invoiceNumber}
          </h1>
          <StatusBadge status={invoice.status} />
        </div>

        <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
          {formatCurrency(invoice.amount, invoice.currency)}
        </p>

        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
              Client
            </dt>
            <dd className="mt-1 text-sm text-gray-900">{invoice.clientName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
              Project
            </dt>
            <dd className="mt-1 text-sm text-gray-900">{invoice.projectName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
              Issue date
            </dt>
            <dd className="mt-1 text-sm text-gray-900">
              {invoice.issueDate.toLocaleDateString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
              Due date
            </dt>
            <dd className="mt-1 text-sm text-gray-900">
              {invoice.dueDate ? invoice.dueDate.toLocaleDateString() : "—"}
            </dd>
          </div>
          {invoice.paidAt && (
            <div>
              <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                Paid on
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {invoice.paidAt.toLocaleDateString()}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
