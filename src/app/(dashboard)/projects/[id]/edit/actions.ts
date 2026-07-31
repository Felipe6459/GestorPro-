"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { parseProjectForm } from "@/lib/validation/project";
import { withToast } from "@/lib/toast-url";
import type { ProjectFormState } from "@/types";

export async function updateProjectAction(
  projectId: string,
  _prevState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const { values, fieldErrors } = parseProjectForm(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return { error: null, fieldErrors };
  }

  const { user, organizationId } = await getCurrentUserOrganization();

  // Changing the client is allowed, but only to one owned by this org —
  // re-verify server-side regardless of what the <select> offered.
  const client = await prisma.client.findFirst({
    where: { id: values.clientId, organizationId },
    select: { id: true },
  });

  if (!client) {
    return {
      error: null,
      fieldErrors: { clientId: "Select a valid client." },
    };
  }

  const result = await prisma.project.updateMany({
    where: { id: projectId, ownerId: user.id },
    data: {
      name: values.name,
      status: values.status,
      startDate: values.startDate,
      endDate: values.endDate,
      clientId: values.clientId,
    },
  });

  if (result.count === 0) {
    return { error: "This project could not be found." };
  }

  redirect(withToast("/projects", "Project updated"));
}
