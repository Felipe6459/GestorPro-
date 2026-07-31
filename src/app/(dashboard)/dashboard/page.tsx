import Link from "next/link";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { MetricCard } from "@/components/dashboard/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";

// PAID and CANCELLED are excluded; everything else (DRAFT, SENT, OVERDUE)
// still represents money the client owes.
const UNPAID_INVOICE_STATUSES = ["DRAFT", "SENT", "OVERDUE"] as const;

export default async function DashboardPage() {
  const { organizationId } = await getCurrentUserOrganization();
  const now = new Date();

  const [
    totalClients,
    activeProjects,
    openTasks,
    overdueTasks,
    unpaidInvoiceAgg,
    recentProjects,
    upcomingTasks,
    recentUnpaidInvoices,
  ] = await Promise.all([
    prisma.client.count({ where: { organizationId } }),
    prisma.project.count({
      where: { organizationId, status: "IN_PROGRESS" },
    }),
    prisma.task.count({
      where: { project: { organizationId }, status: { not: "DONE" } },
    }),
    prisma.task.count({
      where: {
        project: { organizationId },
        status: { not: "DONE" },
        dueDate: { lt: now },
      },
    }),
    prisma.invoice.aggregate({
      where: {
        project: { organizationId },
        status: { in: [...UNPAID_INVOICE_STATUSES] },
      },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.project.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { client: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: {
        project: { organizationId },
        status: { not: "DONE" },
        dueDate: { not: null },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { project: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: {
        project: { organizationId },
        status: { in: [...UNPAID_INVOICE_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        project: { select: { name: true, client: { select: { name: true } } } },
      },
    }),
  ]);

  const unpaidInvoiceCount = unpaidInvoiceAgg._count;
  const outstandingAmount = Number(unpaidInvoiceAgg._sum.amount ?? 0);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          An overview of your clients, projects, tasks, and invoices.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total clients" value={totalClients} href="/clients" />
        <MetricCard
          label="Active projects"
          value={activeProjects}
          href="/projects"
        />
        <MetricCard label="Open tasks" value={openTasks} href="/tasks" />
        <MetricCard label="Overdue tasks" value={overdueTasks} href="/tasks" />
        <MetricCard
          label="Unpaid invoices"
          value={unpaidInvoiceCount}
          href="/invoices"
        />
        <MetricCard
          label="Outstanding amount"
          value={formatCurrency(outstandingAmount)}
          href="/invoices"
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">
          Recent activity
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Recent projects
              </h3>
              <Link
                href="/projects"
                className="rounded text-sm text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              >
                View all
              </Link>
            </div>
            {recentProjects.length === 0 ? (
              <p className="text-sm text-gray-500">No projects yet.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {recentProjects.map((project) => (
                  <li key={project.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/projects/${project.id}/edit`}
                      className="rounded text-sm font-medium text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                    >
                      {project.name}
                    </Link>
                    <p className="text-sm text-gray-500">
                      {project.client.name}
                    </p>
                    <div className="mt-1">
                      <StatusBadge status={project.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Upcoming tasks
              </h3>
              <Link
                href="/tasks"
                className="rounded text-sm text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              >
                View all
              </Link>
            </div>
            {upcomingTasks.length === 0 ? (
              <p className="text-sm text-gray-500">No upcoming tasks.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {upcomingTasks.map((task) => (
                  <li key={task.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/tasks/${task.id}/edit`}
                      className="rounded text-sm font-medium text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                    >
                      {task.title}
                    </Link>
                    <p className="text-sm text-gray-500">{task.project.name}</p>
                    {task.dueDate && (
                      <p className="mt-1 text-xs text-gray-500">
                        Due {task.dueDate.toLocaleDateString()}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Unpaid invoices
              </h3>
              <Link
                href="/invoices"
                className="rounded text-sm text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              >
                View all
              </Link>
            </div>
            {recentUnpaidInvoices.length === 0 ? (
              <p className="text-sm text-gray-500">No unpaid invoices.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {recentUnpaidInvoices.map((invoice) => (
                  <li key={invoice.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/invoices/${invoice.id}/edit`}
                      className="rounded text-sm font-medium text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                    <p className="text-sm text-gray-500">
                      {invoice.project.client.name}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={invoice.status} />
                      <span className="text-xs text-gray-500">
                        {formatCurrency(
                          Number(invoice.amount),
                          invoice.currency,
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
