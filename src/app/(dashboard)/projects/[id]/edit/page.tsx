import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrCreateUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { ProjectForm } from "@/components/projects/project-form";
import { updateProjectAction } from "./actions";

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getOrCreateUser();

  const [project, clients] = await Promise.all([
    prisma.project.findFirst({
      where: { id, ownerId: user.id },
    }),
    prisma.client.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!project) {
    notFound();
  }

  const boundUpdateProjectAction = updateProjectAction.bind(null, project.id);

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Edit project
        </h1>
        <Link
          href="/projects"
          className="rounded text-sm text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          Cancel
        </Link>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <ProjectForm
          action={boundUpdateProjectAction}
          clients={clients}
          defaultValues={{
            name: project.name,
            clientId: project.clientId,
            status: project.status,
            startDate: toDateInputValue(project.startDate),
            endDate: toDateInputValue(project.endDate),
          }}
          submitLabel="Save changes"
          pendingLabel="Saving…"
        />
      </div>
    </div>
  );
}
