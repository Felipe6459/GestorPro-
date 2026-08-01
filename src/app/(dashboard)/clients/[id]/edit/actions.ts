"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { parseClientForm } from "@/lib/validation/client";
import { withToast } from "@/lib/toast-url";
import type { ClientFormState } from "@/types";

export async function updateClientAction(
  clientId: string,
  _prevState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const { values, fieldErrors } = parseClientForm(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return { error: null, fieldErrors };
  }

  const { organizationId } = await getCurrentUserOrganization();

  try {
    const result = await prisma.client.updateMany({
      where: { id: clientId, organizationId },
      data: values,
    });

    if (result.count === 0) {
      return { error: "This client could not be found." };
    }
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        error: null,
        fieldErrors: { email: "A client with this email already exists." },
      };
    }
    throw err;
  }

  redirect(withToast("/clients", "Client updated"));
}
