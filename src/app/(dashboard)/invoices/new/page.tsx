import Link from "next/link";
import { getOrCreateUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { EmptyState } from "@/components/ui/empty-state";
import { createInvoiceAction } from "./actions";

export default async function NewInvoicePage() {
  const user = await getOrCreateUser();
  const projects = await prisma.project.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, client: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Add invoice
        </h1>
        <Link
          href="/invoices"
          className="rounded text-sm text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          Cancel
        </Link>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="You need a project first"
          description="Invoices must belong to a project. Add one before creating an invoice."
          action={
            <Link
              href="/projects/new"
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
            >
              Add project
            </Link>
          }
        />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <InvoiceForm
            action={createInvoiceAction}
            projects={projects.map((project) => ({
              id: project.id,
              label: `${project.name} — ${project.client.name}`,
            }))}
          />
        </div>
      )}
    </div>
  );
}
