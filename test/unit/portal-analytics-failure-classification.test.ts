import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { recordPortalLogin, recordPortalDownloadRequest } from "@/lib/client-portal/analytics-events";

/**
 * Stability Correction F5 — bounded observability for the Portal
 * Analytics write helpers' existing fail-open behavior. The real
 * production functions are used throughout; only the external
 * persistence boundary (the passed-in Prisma-shaped `client` argument,
 * already a normal parameter of both functions — see
 * src/lib/client-portal/analytics-events.ts) is stubbed, to induce
 * deterministic success/failure without a real database or any
 * production test hook. Deliberately complements
 * test/integration/portal/analytics-events.test.ts's own real-Postgres
 * "known_error" proof (a genuine nonexistent-id P2025/P2003) with the
 * unknown-shape side of the same contract, which a real Prisma client
 * cannot be made to throw on demand.
 */

function realKnownRequestError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("mock persistence failure", {
    code: "P2025",
    clientVersion: "test",
    meta: { modelName: "PortalUser" },
  });
}

describe("recordPortalLogin — success path", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls update exactly once with the same data contract, and emits no diagnostic", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const update = vi.fn().mockResolvedValue({});
    const stubClient = { portalUser: { update } } as unknown as Parameters<typeof recordPortalLogin>[0];
    const occurredAt = new Date("2026-08-05T12:00:00.000Z");

    const result = await recordPortalLogin(stubClient, "portal-user-id", occurredAt);

    expect(result).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "portal-user-id" },
      data: { lastLoginAt: occurredAt },
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe("recordPortalDownloadRequest — success path", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls create exactly once with the same data contract, and emits no diagnostic", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const create = vi.fn().mockResolvedValue({});
    const stubClient = { portalDownloadRequest: { create } } as unknown as Parameters<typeof recordPortalDownloadRequest>[0];
    const requestedAt = new Date("2026-08-12T08:30:00.000Z");

    const result = await recordPortalDownloadRequest(stubClient, "org-id", requestedAt);

    expect(result).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ data: { organizationId: "org-id", requestedAt } });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe("known persistence failure — bounded, allowlisted-only diagnostic", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recordPortalLogin: a real Prisma known-request error classifies as known_error, exactly once, fail-open", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const update = vi.fn().mockRejectedValue(realKnownRequestError());
    const stubClient = { portalUser: { update } } as unknown as Parameters<typeof recordPortalLogin>[0];

    const result = await recordPortalLogin(stubClient, "portal-user-id", new Date());

    expect(result).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[portal-analytics] Failed to record portal login.", {
      classification: "known_error",
    });
    // Only the two allowlisted call arguments exist — nothing else.
    expect(consoleErrorSpy.mock.calls[0]).toHaveLength(2);
    expect(Object.keys(consoleErrorSpy.mock.calls[0][1] as object)).toEqual(["classification"]);
  });

  it("recordPortalDownloadRequest: a real Prisma known-request error classifies as known_error, exactly once, fail-open", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const create = vi.fn().mockRejectedValue(realKnownRequestError());
    const stubClient = { portalDownloadRequest: { create } } as unknown as Parameters<typeof recordPortalDownloadRequest>[0];

    const result = await recordPortalDownloadRequest(stubClient, "org-id", new Date());

    expect(result).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[portal-analytics] Failed to record portal download-link request.", {
      classification: "known_error",
    });
    expect(consoleErrorSpy.mock.calls[0]).toHaveLength(2);
    expect(Object.keys(consoleErrorSpy.mock.calls[0][1] as object)).toEqual(["classification"]);
  });
});

describe("unknown thrown shapes — generic bounded classification, and full non-disclosure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Deliberately identifiable marker values planted in every corner a raw
  // error/thrown value could theoretically leak from — message, stack,
  // cause, digest, Prisma-meta-shaped fields, plus fake identifiers/
  // email/URL/storage path, none of which this module ever legitimately
  // touches or receives as real input.
  const MARKERS = {
    message: "MARKER_MESSAGE_9f3a",
    stack: "MARKER_STACK_5e02",
    cause: "MARKER_CAUSE_1c88",
    digest: "MARKER_DIGEST_2b71",
    constraint: "MARKER_CONSTRAINT_Portal_fkey_77aa",
    id: "11111111-2222-3333-4444-555555555555",
    email: "marker-user@example-marker-domain.test",
    url: "https://marker-storage.example.test/marker-bucket/marker-object",
  };

  function markerError(): Error {
    const err = Object.assign(new Error(MARKERS.message), {
      digest: MARKERS.digest,
      cause: MARKERS.cause,
      meta: { modelName: "PortalUser", driverAdapterError: { cause: { constraint: { index: MARKERS.constraint } } } },
      portalUserId: MARKERS.id,
      organizationId: MARKERS.id,
      email: MARKERS.email,
      storagePath: MARKERS.url,
    });
    err.stack = MARKERS.stack;
    return err;
  }

  const unknownShapes: Array<[string, unknown]> = [
    ["a plain Error carrying every marker", markerError()],
    ["a thrown string", `failure: ${MARKERS.message} ${MARKERS.email} ${MARKERS.url}`],
    [
      "a thrown plain object shaped like Prisma metadata",
      { message: MARKERS.message, meta: { constraint: MARKERS.constraint }, id: MARKERS.id },
    ],
    ["a thrown null", null],
    ["a thrown undefined", undefined],
  ];

  it.each(unknownShapes)("recordPortalLogin: %s classifies as unexpected, with no marker anywhere in the logged call", async (_label, thrown) => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const update = vi.fn().mockRejectedValue(thrown);
    const stubClient = { portalUser: { update } } as unknown as Parameters<typeof recordPortalLogin>[0];

    const result = await recordPortalLogin(stubClient, "portal-user-id", new Date());

    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[portal-analytics] Failed to record portal login.", {
      classification: "unexpected",
    });

    const serializedCall = JSON.stringify(consoleErrorSpy.mock.calls[0]);
    for (const marker of Object.values(MARKERS)) {
      expect(serializedCall).not.toContain(marker);
    }
  });

  it.each(unknownShapes)("recordPortalDownloadRequest: %s classifies as unexpected, with no marker anywhere in the logged call", async (_label, thrown) => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const create = vi.fn().mockRejectedValue(thrown);
    const stubClient = { portalDownloadRequest: { create } } as unknown as Parameters<typeof recordPortalDownloadRequest>[0];

    const result = await recordPortalDownloadRequest(stubClient, "org-id", new Date());

    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[portal-analytics] Failed to record portal download-link request.", {
      classification: "unexpected",
    });

    const serializedCall = JSON.stringify(consoleErrorSpy.mock.calls[0]);
    for (const marker of Object.values(MARKERS)) {
      expect(serializedCall).not.toContain(marker);
    }
  });
});

describe("no behavior drift", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a failed recordPortalLogin never throws into the caller, never retries, and logs exactly once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const update = vi.fn().mockRejectedValue(new Error("transient"));
    const stubClient = { portalUser: { update } } as unknown as Parameters<typeof recordPortalLogin>[0];

    await expect(recordPortalLogin(stubClient, "portal-user-id", new Date())).resolves.toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("a failed recordPortalDownloadRequest never throws into the caller, never retries, and logs exactly once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const create = vi.fn().mockRejectedValue(new Error("transient"));
    const stubClient = { portalDownloadRequest: { create } } as unknown as Parameters<typeof recordPortalDownloadRequest>[0];

    await expect(recordPortalDownloadRequest(stubClient, "org-id", new Date())).resolves.toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
