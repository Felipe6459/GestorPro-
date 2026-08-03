// Controllable fake for @/lib/storage/attachments-storage (which imports
// "server-only" and would otherwise throw outside Next's own build — see
// test/integration/setup-mocks.ts for the vi.mock() that swaps it in).
// This never touches a real Supabase Storage bucket; it only lets
// attachment integration tests exercise the REAL uploadAttachmentForEntity/
// deleteAttachmentForEntity Prisma+Activity logic, including the
// upload-succeeds-but-DB-fails compensation path.

let uploadShouldFail = false;
export const removedPaths: string[] = [];

export function setUploadShouldFail(shouldFail: boolean): void {
  uploadShouldFail = shouldFail;
}

export function resetStorageMock(): void {
  uploadShouldFail = false;
  removedPaths.length = 0;
}

export async function mockUploadAttachmentObject(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (uploadShouldFail) return { ok: false, reason: "upload_failed" };
  return { ok: true };
}

export async function mockRemoveAttachmentObject({
  path,
}: {
  path: string;
}): Promise<{ ok: true }> {
  removedPaths.push(path);
  return { ok: true };
}
