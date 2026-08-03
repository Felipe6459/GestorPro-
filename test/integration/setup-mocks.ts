import { vi } from "vitest";
import { getMockAuthUser, mockCookies } from "../support/auth-mock";
import { mockUploadAttachmentObject, mockRemoveAttachmentObject } from "../support/storage-mock";
import { mockRedirect, mockNotFound, mockRevalidatePath } from "../support/navigation-mock";

// The ONLY things mocked across the whole integration suite — every one
// of them because the REAL implementation needs an actual Next.js request
// context (AsyncLocalStorage) or a live external network call, neither of
// which plain Vitest provides:
//  - next/headers' cookies()
//  - next/navigation's redirect()/notFound()
//  - next/cache's revalidatePath()
//  - @/lib/supabase/server's createClient() (auth.getUser() would need a
//    live Supabase Auth network call — stubbed to whatever
//    test/support/auth-mock.ts's setMockAuthUser() currently holds)
//  - @/lib/storage/attachments-storage (imports "server-only", and its
//    real implementation needs a live Supabase Storage bucket)
// Everything else — getOrCreateUser, getCurrentMembership,
// getCurrentPortalUser, and every real Server Action/query function built
// on them — runs unmodified against the real (test) Postgres via the real
// Prisma client.

vi.mock("next/headers", () => ({
  cookies: async () => mockCookies(),
  // Empty headers — getRequestIp() (src/lib/rate-limit/ip.ts) falls back
  // to its own documented "unknown" bucket when neither x-real-ip nor
  // x-forwarded-for is present, exactly like local dev without Vercel.
  headers: async () => new Headers(),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
  revalidateTag: mockRevalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      async getUser() {
        const user = getMockAuthUser();
        return { data: { user: user ? { ...user, user_metadata: user.user_metadata ?? {} } : null } };
      },
      async signOut() {
        return { error: null };
      },
    },
  }),
}));

vi.mock("@/lib/storage/attachments-storage", () => ({
  uploadAttachmentObject: mockUploadAttachmentObject,
  removeAttachmentObject: mockRemoveAttachmentObject,
}));

// The rate limiter's store is a real module-level singleton Map (see
// src/lib/rate-limit/store.ts) — it would otherwise persist across every
// integration test file in this one process, and a concurrency test
// firing many accept-invite calls at once (test/integration/invitations/
// concurrent-accept.test.ts) would trip the real 20/hour limit as an
// unrelated side effect. Rate-limiting's own logic (allow/block/isolation/
// sweep) is already exhaustively unit-tested in Stage 3 — Stage 4 only
// needs every limit-guarded action to keep working when never limited.
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, checkRateLimit: () => ({ limited: false }) };
});
