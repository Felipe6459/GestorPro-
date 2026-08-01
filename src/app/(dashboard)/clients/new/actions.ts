"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrganization } from "@/lib/current-user";
import { parseClientForm } from "@/lib/validation/client";
import { withToast } from "@/lib/toast-url";
import { createActivity } from "@/lib/activity/create-activity";
import { buildClientActivityMetadata } from "@/lib/activity/client-metadata";
import type { ClientFormState } from "@/types";

export async function createClientAction(
  _prevState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const { values, fieldErrors } = parseClientForm(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return { error: null, fieldErrors };
  }

  const { user, organizationId } = await getCurrentUserOrganization();

  try {
    // Client create and its Activity row are one atomic unit — if the
    // Activity insert fails for any reason, the Client create rolls back
    // with it rather than leaving an unlogged row behind.
    await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: { ...values, userId: user.id, organizationId },
      });

      await createActivity(tx, {
        organizationId,
        actorId: user.id,
        entityType: "CLIENT",
        entityId: client.id,
        action: "CREATED",
        metadata: buildClientActivityMetadata(client, user.name),
      });
    });
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

  redirect(withToast("/clients", "Client created"));
}
