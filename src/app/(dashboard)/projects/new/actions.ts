"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/current-user";
import { parseProjectForm } from "@/lib/validation/project";
import { withToast } from "@/lib/toast-url";
import type { ProjectFormState } from "@/types";

export async function createProjectAction(
  _prevState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const { values, fieldErrors } = parseProjectForm(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return { error: null, fieldErrors };
  }

  const user = await getOrCreateUser();

  // The <select> only lists this user's clients, but the form value is
  // still client-controlled input — re-verify ownership server-side so a
  // tampered clientId can never attach a project to another user's client.
  const client = await prisma.client.findFirst({
    where: { id: values.clientId, userId: user.id },
    select: { id: true },
  });

  if (!client) {
    return {
      error: null,
      fieldErrors: { clientId: "Select a valid client." },
    };
  }

  await prisma.project.create({
    data: {
      name: values.name,
      status: values.status,
      startDate: values.startDate,
      endDate: values.endDate,
      clientId: values.clientId,
      ownerId: user.id,
    },
  });

  redirect(withToast("/projects", "Project created"));
}
