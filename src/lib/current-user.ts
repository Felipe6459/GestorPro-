import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/**
 * Ensures a Prisma User row exists for the currently authenticated Supabase
 * user, using the Supabase auth user id as the Prisma User id. Called
 * independently from ~20 pages/actions with no shared request-level cache,
 * so on a first-ever login it's normal for several of these (e.g. Next.js
 * prefetching sidebar links) to race to create the same row concurrently.
 * If this call loses that race, the row now exists (created by the winner),
 * so we just read it back instead of surfacing the P2002.
 */
export async function getOrCreateUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  try {
    return await prisma.user.upsert({
      where: { id: authUser.id },
      update: {},
      create: {
        id: authUser.id,
        email: authUser.email!,
        name: authUser.user_metadata?.name ?? authUser.email!.split("@")[0],
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.user.findUnique({
        where: { id: authUser.id },
      });
      if (existing) {
        return existing;
      }
    }
    throw err;
  }
}
