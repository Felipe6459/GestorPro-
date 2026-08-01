"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { parseTaskForm, deriveCompletedAt } from "@/lib/validation/task";
import { withToast } from "@/lib/toast-url";
import type { TaskFormState } from "@/types";

export async function updateTaskAction(
  taskId: string,
  _prevState: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const { values, fieldErrors } = parseTaskForm(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return { error: null, fieldErrors };
  }

  const { organizationId } = await getCurrentUserOrganization();

  // Changing the project is allowed, but only to one owned by this org —
  // re-verify server-side regardless of what the <select> offered.
  const project = await prisma.project.findFirst({
    where: { id: values.projectId, organizationId },
    select: { id: true },
  });

  if (!project) {
    return {
      error: null,
      fieldErrors: { projectId: "Select a valid project." },
    };
  }

  // Scoped through the task's *current* project's organization — never by
  // id alone. Also need the existing completedAt to derive the new value.
  const existingTask = await prisma.task.findFirst({
    where: { id: taskId, project: { organizationId } },
    select: { completedAt: true },
  });

  if (!existingTask) {
    return { error: "This task could not be found." };
  }

  const result = await prisma.task.updateMany({
    where: { id: taskId, project: { organizationId } },
    data: {
      title: values.title,
      description: values.description,
      status: values.status,
      priority: values.priority,
      dueDate: values.dueDate,
      completedAt: deriveCompletedAt(values.status, existingTask.completedAt),
      projectId: values.projectId,
    },
  });

  if (result.count === 0) {
    return { error: "This task could not be found." };
  }

  redirect(withToast("/tasks", "Task updated"));
}
