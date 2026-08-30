import Link from "next/link";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { TaskForm } from "@/components/tasks/task-form";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTION_LINK_CLASSES } from "@/components/ui/action-link-classes";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";
import { createTaskAction } from "./actions";

// Matches Button's own primary variant tokens — same constant used by
// the Clients/Invoices/Projects/Tasks list pages' own primary action.
const PRIMARY_LINK_CLASSES =
  "focus-visible:ring-focus-ring rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

export default async function NewTaskPage() {
  const { organizationId } = await getCurrentUserOrganization();
  const projects = await prisma.project.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, client: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-text-primary text-2xl font-semibold tracking-tight">
          Add task
        </h1>
        <Link href="/tasks" className={ACTION_LINK_CLASSES}>
          Cancel
        </Link>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="You need a project first"
          description="Tasks must belong to a project. Add one before creating a task."
          action={
            <Link href="/projects/new" className={PRIMARY_LINK_CLASSES}>
              Add project
            </Link>
          }
        />
      ) : (
        <div className={`p-6 ${CARD_SURFACE_CLASSES}`}>
          <TaskForm
            action={createTaskAction}
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
