import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { TaskForm } from "@/components/tasks/task-form";
import { updateTaskAction } from "./actions";

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organizationId } = await getCurrentUserOrganization();

  const [task, projects] = await Promise.all([
    prisma.task.findFirst({
      where: { id, project: { ownerId: user.id } },
    }),
    prisma.project.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, client: { select: { name: true } } },
    }),
  ]);

  if (!task) {
    notFound();
  }

  const boundUpdateTaskAction = updateTaskAction.bind(null, task.id);

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Edit task
        </h1>
        <Link
          href="/tasks"
          className="rounded text-sm text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          Cancel
        </Link>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <TaskForm
          action={boundUpdateTaskAction}
          projects={projects.map((project) => ({
            id: project.id,
            label: `${project.name} — ${project.client.name}`,
          }))}
          defaultValues={{
            title: task.title,
            description: task.description ?? "",
            projectId: task.projectId,
            status: task.status,
            priority: task.priority,
            dueDate: toDateInputValue(task.dueDate),
          }}
          submitLabel="Save changes"
          pendingLabel="Saving…"
        />
      </div>
    </div>
  );
}
