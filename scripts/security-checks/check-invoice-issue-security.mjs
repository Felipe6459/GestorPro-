import { existsSync, readFileSync } from "node:fs";
import { grep, report } from "./lib.mjs";

// Invoice System Official Slice 3, sub-PR 3b's own live Issue/finalization
// boundary — every check below targets a specific, durable way that
// boundary could quietly weaken, the same discipline as
// check-cron-security.mjs for its own trust boundary.

let ok = true;

const actionFile = "src/app/(dashboard)/invoices/[id]/edit/issue-actions.ts";
const serviceFile = "src/lib/invoices/pdf/issue-invoice.ts";
const storageFile = "src/lib/invoices/pdf/storage.ts";
// Invoice System Official Slice 3, Legacy Archive — the shared post-upload
// compensation helper extracted from issue-invoice.ts's own former private
// compensateUpload(). Declared here, at top level, since both the Issue
// checks (8e, below) and the Legacy Archive checks (12n, below) need it.
const compensationFile = "src/lib/invoices/pdf/archive-compensation.ts";

// 1. The dedicated Issue action exists.
ok = report(`${actionFile} exists`, existsSync(actionFile), existsSync(actionFile) ? "" : `Expected ${actionFile} to exist.`) && ok;

if (existsSync(actionFile)) {
  const actionContent = readFileSync(actionFile, "utf8");

  // 2. It resolves the actor from real server-side membership, never a
  // client-declared value.
  ok = report(
    `${actionFile} loads trusted server-side membership (getCurrentMembership)`,
    actionContent.includes("getCurrentMembership"),
    "",
  ) && ok;

  // 3. It independently checks OWNER access itself (never relies solely on
  // issueInvoice()'s own re-check, or on the UI hiding the control).
  ok = report(
    `${actionFile} independently checks OWNER access (assertCanAccessPaymentDetails)`,
    actionContent.includes("assertCanAccessPaymentDetails"),
    "",
  ) && ok;

  // 4. Its own exported function signature accepts only invoiceId/
  // expectedUpdatedAt from the caller — never organizationId/role/
  // storagePath/totals/snapshots as a parameter name.
  const forbiddenParamNames = ["organizationId", "role", "storagePath", "totals", "snapshot", "actorName", "userId"];
  const signatureMatch = actionContent.match(/export async function issueInvoiceAction\(([^)]*)\)/);
  const signature = signatureMatch ? signatureMatch[1] : "";
  const leakedParams = forbiddenParamNames.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(signature));
  ok = report(
    "issueInvoiceAction's own parameter list contains none of: organizationId, role, storagePath, totals, snapshot, actorName, userId",
    leakedParams.length === 0,
    leakedParams.join(", "),
  ) && ok;
}

// 5. The service itself also independently re-checks OWNER access — never
// trusting the action's own check alone.
if (existsSync(serviceFile)) {
  const serviceContent = readFileSync(serviceFile, "utf8");
  ok = report(
    `${serviceFile} independently checks OWNER access (assertCanAccessPaymentDetails)`,
    serviceContent.includes("assertCanAccessPaymentDetails"),
    "",
  ) && ok;

  // 6. No PDF Storage call (upload/remove) appears textually inside the
  // final prisma.$transaction(...) callback — a deliberately blunt,
  // line-range proxy: everything between "prisma.$transaction(async (tx)"
  // and its own closing "});" must not mention deps.upload/deps.remove.
  const txStart = serviceContent.indexOf("prisma.$transaction(async (tx)");
  if (txStart === -1) {
    ok = report(`${serviceFile} contains a prisma.$transaction(...) call`, false, "") && ok;
  } else {
    const txEnd = serviceContent.indexOf("\n  } catch (err) {", txStart);
    const txBody = txEnd === -1 ? serviceContent.slice(txStart) : serviceContent.slice(txStart, txEnd);
    const storageCallInTx = /deps\.(upload|remove)\(/.test(txBody);
    ok = report(
      "no Storage operation (deps.upload/deps.remove) occurs inside the final DB transaction",
      !storageCallInTx,
      storageCallInTx ? "Found deps.upload(...)/deps.remove(...) between the transaction's opening and its catch block." : "",
    ) && ok;
  }
} else {
  ok = report(`${serviceFile} exists`, false, `Expected ${serviceFile} to exist.`) && ok;
}

// 7. Production upload uses true create-only semantics — upsert: false,
// never true, never omitted.
if (existsSync(storageFile)) {
  const storageContent = readFileSync(storageFile, "utf8");
  ok = report(
    `${storageFile} uploads with upsert: false`,
    storageContent.includes("upsert: false"),
    "",
  ) && ok;

  // 8. No public URL is ever generated for an Invoice PDF object (this
  // bucket is private; the module must never call getPublicUrl).
  ok = report(
    `${storageFile} never calls getPublicUrl`,
    !storageContent.includes("getPublicUrl"),
    "",
  ) && ok;

  // 8b. uploadInvoicePdfObject()/removeInvoicePdfObject() each destructure
  // a structured `identity`, never a raw caller-supplied `path` — a
  // correction-pass invariant: a TypeScript-only branded-string contract
  // would still let a caller pass an arbitrary string at runtime, so the
  // actual exported function signatures themselves are inspected here,
  // not just a doc comment's claim about them.
  const uploadSigMatch = storageContent.match(/export async function uploadInvoicePdfObject\(\s*\{([^}]*)\}/);
  const removeSigMatch = storageContent.match(/export async function removeInvoicePdfObject\(\s*\{([^}]*)\}/);
  const uploadSig = uploadSigMatch ? uploadSigMatch[1] : "";
  const removeSig = removeSigMatch ? removeSigMatch[1] : "";
  ok = report(
    "uploadInvoicePdfObject()'s own parameter destructures { identity, body }, never a raw path",
    /\bidentity\b/.test(uploadSig) && !/\bpath\s*:/.test(uploadSig) && !/^\s*path\b/.test(uploadSig),
    uploadSig,
  ) && ok;
  ok = report(
    "removeInvoicePdfObject()'s own parameter destructures { identity }, never a raw path",
    /\bidentity\b/.test(removeSig) && !/\bpath\s*:/.test(removeSig) && !/^\s*path\b/.test(removeSig),
    removeSig,
  ) && ok;

  // 8c. Both functions actually reconstruct the path from that identity
  // via buildInvoicePdfStoragePath() — an identity accepted but never
  // used to rebuild the path would defeat the whole point.
  const uploadBodyEnd = storageContent.indexOf("export async function removeInvoicePdfObject");
  const uploadBody = uploadSigMatch ? storageContent.slice(storageContent.indexOf(uploadSigMatch[0]), uploadBodyEnd === -1 ? undefined : uploadBodyEnd) : "";
  const removeBody = removeSigMatch ? storageContent.slice(storageContent.indexOf(removeSigMatch[0])) : "";
  ok = report(
    "uploadInvoicePdfObject() rebuilds the path via buildInvoicePdfStoragePath(identity)",
    /buildInvoicePdfStoragePath\(identity\)/.test(uploadBody),
    "",
  ) && ok;
  ok = report(
    "removeInvoicePdfObject() rebuilds the path via buildInvoicePdfStoragePath(identity)",
    /buildInvoicePdfStoragePath\(identity\)/.test(removeBody),
    "",
  ) && ok;
}

// 8d. The Issue service's own call to deps.upload passes an `identity`,
// never a raw `path` — the caller side of the same boundary. deps.remove
// is checked separately, below, against the shared archive-compensation.ts
// module — since the extracted compensateArchiveUpload() helper (Invoice
// System Official Slice 3, Legacy Archive) is now the one place either
// pipeline ever calls deps.remove(), issue-invoice.ts itself no longer
// contains that call textually after the extraction.
if (existsSync(serviceFile)) {
  const serviceContent = readFileSync(serviceFile, "utf8");
  const uploadCallMatch = serviceContent.match(/deps\.upload\(\{([^}]*)\}\)/);
  ok = report(
    "issue-invoice.ts's own deps.upload(...) call passes { identity, body }, never a raw path",
    !!uploadCallMatch && /\bidentity\b/.test(uploadCallMatch[1]) && !/\bpath\s*:/.test(uploadCallMatch[1]),
    uploadCallMatch ? uploadCallMatch[1] : "deps.upload(...) call not found",
  ) && ok;
}

// 8e. The shared compensation helper's own call to deps.remove passes an
// `identity`, never a raw `path` — this is the one place either pipeline
// (Issue or Legacy Archive) ever removes an uploaded object during
// compensation.
if (existsSync(compensationFile)) {
  const compensationRemoveContent = readFileSync(compensationFile, "utf8");
  const removeCallMatches = [...compensationRemoveContent.matchAll(/deps\.remove\(\{([^}]*)\}\)/g)];
  ok = report(
    "every archive-compensation.ts deps.remove(...) call passes { identity }, never a raw path",
    removeCallMatches.length > 0 && removeCallMatches.every(([, args]) => /\bidentity\b/.test(args) && !/\bpath\s*:/.test(args)),
    removeCallMatches.map(([, args]) => args).join(" | ") || "deps.remove(...) call not found",
  ) && ok;
} else {
  ok = report(`${compensationFile} exists`, false, `Expected ${compensationFile} to exist.`) && ok;
}

// 9. The public Issue result contract (IssueInvoiceSuccess) has no
// storagePath field.
const lifecycleFile = "src/lib/invoices/lifecycle.ts";
if (existsSync(lifecycleFile)) {
  const lifecycleContent = readFileSync(lifecycleFile, "utf8");
  const successMatch = lifecycleContent.match(/export type IssueInvoiceSuccess = \{[^}]*\}/);
  const successBlock = successMatch ? successMatch[0] : "";
  ok = report(
    "IssueInvoiceSuccess contains no storagePath/pdfStoragePath/bucket field",
    successBlock.length > 0 && !/storagePath|bucket/i.test(successBlock),
    successBlock,
  ) && ok;
}

// 10. No InvoiceEmailAttempt writer was introduced in this sub-PR — that
// remains Slice 4's. A bare mention in a doc comment referencing Slice 4
// is fine; an actual Prisma write call is not.
const emailAttemptWrite = grep("invoiceEmailAttempt\\.(create|createMany|upsert)", "src/lib/invoices/");
ok = report(
  "no InvoiceEmailAttempt writer exists under src/lib/invoices/ (Slice 4's, not this sub-PR's)",
  emailAttemptWrite === "",
  emailAttemptWrite,
) && ok;

// 11. Portal Invoice PDF access — this sub-PR's own new trust boundary,
// verified with the same fail-closed discipline as the staff Issue
// checks above. Replaces this check's own prior assertion that the
// route "does not exist yet (out of scope for this sub-PR)" — accurate
// for sub-PR 3b/3c, now obsolete since Portal Invoice PDF access is
// exactly this sub-PR's own scope. A narrow, exact-file check (not a
// repository-wide ban), matching this script's own established style.
const portalPdfRoute = "src/app/api/portal/invoices/[id]/pdf/route.ts";

ok = report(
  `${portalPdfRoute} exists`,
  existsSync(portalPdfRoute),
  existsSync(portalPdfRoute) ? "" : `Expected ${portalPdfRoute} to exist.`,
) && ok;

if (existsSync(portalPdfRoute)) {
  const portalPdfContent = readFileSync(portalPdfRoute, "utf8");

  // 11a. Resolves identity through the real Portal auth boundary, never
  // the staff one.
  ok = report(
    `${portalPdfRoute} resolves identity via getCurrentPortalUser`,
    portalPdfContent.includes("getCurrentPortalUser"),
    "",
  ) && ok;

  // 11b. Uses its own dedicated, isolated rate limiter — never shares a
  // bucket with the staff Invoice PDF route or either Attachment route.
  ok = report(
    `${portalPdfRoute} uses the dedicated PORTAL_INVOICE_PDF_DOWNLOAD_LIMIT`,
    portalPdfContent.includes("PORTAL_INVOICE_PDF_DOWNLOAD_LIMIT"),
    "",
  ) && ok;

  // 11c. classifyInvoiceArchival() remains the single eligibility gate.
  ok = report(
    `${portalPdfRoute} calls classifyInvoiceArchival`,
    portalPdfContent.includes("classifyInvoiceArchival"),
    "",
  ) && ok;

  // 11d. Rebuilds the canonical path before ever signing — never trusts
  // a raw persisted path as the source of truth.
  ok = report(
    `${portalPdfRoute} calls buildInvoicePdfStoragePath before signing`,
    portalPdfContent.includes("buildInvoicePdfStoragePath"),
    "",
  ) && ok;

  // 11e. Reuses the existing signed-URL helper — never a duplicated
  // bucket/TTL/filename/TEST_MODE/signing implementation.
  ok = report(
    `${portalPdfRoute} calls createInvoicePdfSignedUrl`,
    portalPdfContent.includes("createInvoicePdfSignedUrl"),
    "",
  ) && ok;

  // 11f. Never writes Portal Analytics — this sub-PR deliberately keeps
  // the existing PortalDownloadRequest metric attachment-only. Comments
  // stripped first: this route's own doc comment intentionally names
  // recordPortalDownloadRequest() in prose to explain why it is *not*
  // called, which a bare substring check against the raw file would
  // wrongly flag as a violation.
  const portalPdfCodeOnly = portalPdfContent.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok = report(
    `${portalPdfRoute} never imports or calls recordPortalDownloadRequest`,
    !portalPdfCodeOnly.includes("recordPortalDownloadRequest"),
    "",
  ) && ok;

  // 11g. Never exposes a permanent public URL for a private-bucket
  // object.
  ok = report(
    `${portalPdfRoute} never calls getPublicUrl`,
    !portalPdfContent.includes("getPublicUrl"),
    "",
  ) && ok;

  // 11h. No console logging of any kind — generic responses only, never
  // a path/signed-URL/invoice-number/identifier printed anywhere.
  const portalPdfConsoleCalls = grep("console\\.(log|error|warn|info|debug)\\(", portalPdfRoute);
  ok = report(
    `${portalPdfRoute} contains no console logging`,
    portalPdfConsoleCalls === "",
    portalPdfConsoleCalls,
  ) && ok;

  // 11i. The Invoice lookup is scoped by the real Portal Client-boundary
  // fields — clientId (primary), organizationId (defense in depth), and
  // project.clientId (defense against Invoice/Project relation drift) —
  // never the staff organizationId-only boundary.
  ok = report(
    `${portalPdfRoute} scopes its Invoice query by clientId, organizationId, and project's clientId`,
    portalPdfContent.includes("clientId") &&
      portalPdfContent.includes("organizationId") &&
      /project:\s*\{\s*clientId\s*\}/.test(portalPdfContent),
    "",
  ) && ok;
}

// 12. Invoice System Official Slice 3, Legacy Archive — its own new trust
// boundary, verified with the same fail-closed discipline as the Issue and
// Portal PDF checks above. Legacy Archive is a retroactive, OWNER-only
// archival action for an already-non-DRAFT invoice, structurally similar
// to Issue but never a DRAFT -> SENT transition — these checks additionally
// guard the specific invariants that distinguish it (status/amount/
// documentVersion must never be written, the shared compensation helper
// must be used, no duplicate local implementation may exist).
const legacyActionFile = "src/app/(dashboard)/invoices/[id]/edit/legacy-archive-actions.ts";
const legacyServiceFile = "src/lib/invoices/pdf/legacy-archive-invoice.ts";

// 12a. The dedicated Legacy Archive action exists.
ok =
  report(
    `${legacyActionFile} exists`,
    existsSync(legacyActionFile),
    existsSync(legacyActionFile) ? "" : `Expected ${legacyActionFile} to exist.`,
  ) && ok;

if (existsSync(legacyActionFile)) {
  const legacyActionContent = readFileSync(legacyActionFile, "utf8");

  // 12b. It resolves the actor from real server-side membership, never a
  // client-declared value.
  ok = report(
    `${legacyActionFile} loads trusted server-side membership (getCurrentMembership)`,
    legacyActionContent.includes("getCurrentMembership"),
    "",
  ) && ok;

  // 12c. It independently checks OWNER access itself (never relies solely
  // on archiveLegacyInvoice()'s own re-check, or on the UI hiding the
  // control).
  ok = report(
    `${legacyActionFile} independently checks OWNER access (assertCanAccessPaymentDetails)`,
    legacyActionContent.includes("assertCanAccessPaymentDetails"),
    "",
  ) && ok;

  // 12d. Its own exported function signature accepts only invoiceId/
  // expectedUpdatedAt from the caller — never organizationId/role/
  // storagePath/totals/snapshots/amount/status/documentVersion as a
  // parameter name.
  const legacyForbiddenParamNames = [
    "organizationId",
    "role",
    "storagePath",
    "totals",
    "snapshot",
    "actorName",
    "userId",
    "amount",
    "status",
    "documentVersion",
  ];
  const legacySignatureMatch = legacyActionContent.match(/export async function archiveLegacyInvoiceAction\(([^)]*)\)/);
  const legacySignature = legacySignatureMatch ? legacySignatureMatch[1] : "";
  const legacyLeakedParams = legacyForbiddenParamNames.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(legacySignature));
  ok = report(
    "archiveLegacyInvoiceAction's own parameter list contains none of: organizationId, role, storagePath, totals, snapshot, actorName, userId, amount, status, documentVersion",
    legacyLeakedParams.length === 0,
    legacyLeakedParams.join(", "),
  ) && ok;

  // 12e. No console logging of any kind.
  const legacyActionConsoleCalls = grep("console\\.(log|error|warn|info|debug)\\(", legacyActionFile);
  ok = report(`${legacyActionFile} contains no console logging`, legacyActionConsoleCalls === "", legacyActionConsoleCalls) && ok;
}

// 12f. The service itself also independently re-checks OWNER access —
// never trusting the action's own check alone.
if (existsSync(legacyServiceFile)) {
  const legacyServiceContent = readFileSync(legacyServiceFile, "utf8");

  ok = report(
    `${legacyServiceFile} independently checks OWNER access (assertCanAccessPaymentDetails)`,
    legacyServiceContent.includes("assertCanAccessPaymentDetails"),
    "",
  ) && ok;

  // 12g. classifyInvoiceArchival() remains the single eligibility gate —
  // never an independently re-derived narrower check.
  ok = report(
    `${legacyServiceFile} calls classifyInvoiceArchival`,
    legacyServiceContent.includes("classifyInvoiceArchival"),
    "",
  ) && ok;

  // 12h. Reuses the shared compensation helper — never a duplicated local
  // implementation.
  ok = report(
    `${legacyServiceFile} calls the shared compensateArchiveUpload helper`,
    legacyServiceContent.includes("compensateArchiveUpload"),
    "",
  ) && ok;
  ok = report(
    `${legacyServiceFile} does not define its own local compensation function`,
    !/async function compensate/.test(legacyServiceContent),
    "",
  ) && ok;

  // 12i. Reuses the existing create-only upload helper — never a
  // reimplemented upload/overwrite path.
  ok = report(
    `${legacyServiceFile} reuses uploadInvoicePdfObject (never a reimplemented upload)`,
    legacyServiceContent.includes("uploadInvoicePdfObject") && !legacyServiceContent.includes("upsert: true"),
    "",
  ) && ok;

  // 12j. The final transaction's guarded Invoice update carries the full
  // five-field legacy-eligibility predicate, using Prisma.DbNull (never a
  // bare JSON null) for the two Json? columns.
  ok = report(
    `${legacyServiceFile} guards on the full archive-null predicate (finalizedAt/pdfStoragePath/pdfGeneratedAt null, issuerSnapshot/recipientSnapshot via Prisma.DbNull)`,
    legacyServiceContent.includes("finalizedAt: null") &&
      legacyServiceContent.includes("pdfStoragePath: null") &&
      legacyServiceContent.includes("pdfGeneratedAt: null") &&
      legacyServiceContent.includes("issuerSnapshot: { equals: Prisma.DbNull }") &&
      legacyServiceContent.includes("recipientSnapshot: { equals: Prisma.DbNull }"),
    "",
  ) && ok;

  // 12k. The same guard also requires the exact status the PDF was
  // rendered against — never "any non-DRAFT status" — so a status change
  // mid-operation conflicts rather than silently committing.
  ok = report(
    `${legacyServiceFile} guards on the exact initial status (status: initialStatus)`,
    legacyServiceContent.includes("status: initialStatus"),
    "",
  ) && ok;

  // 12l. No PDF Storage call (upload/remove) appears textually inside the
  // final prisma.$transaction(...) callback — the same blunt line-range
  // proxy check #6 above already applies to issue-invoice.ts.
  const legacyTxStart = legacyServiceContent.indexOf("prisma.$transaction(async (tx)");
  if (legacyTxStart === -1) {
    ok = report(`${legacyServiceFile} contains a prisma.$transaction(...) call`, false, "") && ok;
  } else {
    const legacyTxEnd = legacyServiceContent.indexOf("\n  } catch (err) {", legacyTxStart);
    const legacyTxBody = legacyTxEnd === -1 ? legacyServiceContent.slice(legacyTxStart) : legacyServiceContent.slice(legacyTxStart, legacyTxEnd);
    const legacyStorageCallInTx = /deps\.(upload|remove)\(/.test(legacyTxBody);
    ok = report(
      "no Storage operation (deps.upload/deps.remove) occurs inside the Legacy Archive final DB transaction",
      !legacyStorageCallInTx,
      legacyStorageCallInTx ? "Found deps.upload(...)/deps.remove(...) between the transaction's opening and its catch block." : "",
    ) && ok;

    // 12m. Inside that same transaction body, the guarded Invoice
    // updateMany's own `data` object never writes status, amount, or
    // documentVersion — a targeted extraction of the `data: {...}` block
    // passed to `tx.invoice.updateMany`, not a whole-file scan (which
    // would also match the unrelated `where` clause's own `status:
    // initialStatus` predicate).
    const legacyUpdateManyStart = legacyTxBody.indexOf("tx.invoice.updateMany(");
    const legacyDataStart = legacyUpdateManyStart === -1 ? -1 : legacyTxBody.indexOf("data: {", legacyUpdateManyStart);
    const legacyDataEnd = legacyDataStart === -1 ? -1 : legacyTxBody.indexOf("if (updateResult.count", legacyDataStart);
    const legacyDataBlock = legacyDataStart === -1 || legacyDataEnd === -1 ? "" : legacyTxBody.slice(legacyDataStart, legacyDataEnd);
    ok = report(
      "the Legacy Archive Invoice update's own data object exists and is non-empty",
      legacyDataBlock.length > 0,
      "",
    ) && ok;
    ok = report(
      "the Legacy Archive Invoice update's own data object never writes status/amount/documentVersion",
      legacyDataBlock.length > 0 && !/\bstatus\s*:/.test(legacyDataBlock) && !/\bamount\s*:/.test(legacyDataBlock) && !/\bdocumentVersion\s*:/.test(legacyDataBlock),
      legacyDataBlock,
    ) && ok;
  }
} else {
  ok = report(`${legacyServiceFile} exists`, false, `Expected ${legacyServiceFile} to exist.`) && ok;
}

// 12n. The shared compensation module exists, is server-only, and is the
// one place both Issue and Legacy Archive perform post-upload compensation
// — no duplicate implementation remains in either caller.
ok = report(
  `${compensationFile} exists`,
  existsSync(compensationFile),
  existsSync(compensationFile) ? "" : `Expected ${compensationFile} to exist.`,
) && ok;

if (existsSync(compensationFile)) {
  const compensationContent = readFileSync(compensationFile, "utf8");
  ok = report(`${compensationFile} begins with import "server-only"`, /^import "server-only";/m.test(compensationContent), "") && ok;
  ok = report(`${compensationFile} exports compensateArchiveUpload`, /export async function compensateArchiveUpload/.test(compensationContent), "") && ok;
}

const issueServiceContentForCompensationCheck = existsSync(serviceFile) ? readFileSync(serviceFile, "utf8") : "";
ok = report(
  `${serviceFile} no longer defines its own local compensation function (uses the shared helper)`,
  issueServiceContentForCompensationCheck.includes("compensateArchiveUpload") && !/async function compensateUpload/.test(issueServiceContentForCompensationCheck),
  "",
) && ok;

// 12o. Neither new Legacy Archive file, nor the shared compensation
// module, ever sends email, writes InvoiceEmailAttempt, writes
// PortalDownloadRequest, or implements any reconciliation/bucket-listing/
// cron surface. check #10 above already bans InvoiceEmailAttempt writers
// repo-wide under src/lib/invoices/; these checks target the additional,
// Legacy-Archive-specific forbidden surfaces by name.
const legacyForbiddenSurfacePattern =
  "(deliverNotificationEmails|sendEmailViaResend|recordPortalDownloadRequest|PortalDownloadRequest|CRON_SECRET|storage\\.from\\([^)]*\\)\\.list\\()";
for (const file of [legacyServiceFile, legacyActionFile, compensationFile]) {
  if (!existsSync(file)) continue;
  const match = grep(legacyForbiddenSurfacePattern, file);
  ok = report(
    `${file} contains none of: deliverNotificationEmails, sendEmailViaResend, recordPortalDownloadRequest/PortalDownloadRequest, CRON_SECRET, a Storage bucket .list() call`,
    match === "",
    match,
  ) && ok;
}

// 13. Staff Invoice PDF download route (sub-PR 3c) — its own dedicated
// trust boundary never got a check block when it originally shipped
// (only its Portal sibling, check #11 above, did). This route is
// currently implemented correctly (verified by direct source read); this
// block exists purely to guard that existing boundary against a future
// regression, the same fail-closed discipline as check #11's own Portal
// block, never a claim that a vulnerability exists today.
const staffPdfRoute = "src/app/api/invoices/[id]/pdf/route.ts";

ok = report(
  `${staffPdfRoute} exists`,
  existsSync(staffPdfRoute),
  existsSync(staffPdfRoute) ? "" : `Expected ${staffPdfRoute} to exist.`,
) && ok;

if (existsSync(staffPdfRoute)) {
  const staffPdfContent = readFileSync(staffPdfRoute, "utf8");
  // Comments stripped once, up front — every forbidden-call check below
  // reads from this stripped copy, so this route's own doc comments can
  // never create a false positive (e.g. prose mentioning a forbidden
  // function name to explain why it's absent).
  const staffPdfCodeOnly = staffPdfContent.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  // 13a. Resolves identity through the real staff auth boundary.
  ok = report(
    `${staffPdfRoute} resolves identity via getCurrentUserOrganization`,
    staffPdfContent.includes("getCurrentUserOrganization"),
    "",
  ) && ok;

  // 13b. Uses its own dedicated rate limiter — never a shared/borrowed
  // bucket.
  ok = report(
    `${staffPdfRoute} uses the dedicated INVOICE_PDF_DOWNLOAD_LIMIT`,
    staffPdfContent.includes("INVOICE_PDF_DOWNLOAD_LIMIT"),
    "",
  ) && ok;

  // 13c. That limiter is actually passed to checkRateLimit(...), keyed by
  // user.id — not merely imported/mentioned in a comment.
  const rateLimitCallMatch = staffPdfCodeOnly.match(/checkRateLimit\(([^)]*)\)/);
  const rateLimitArgs = rateLimitCallMatch ? rateLimitCallMatch[1] : "";
  ok = report(
    `${staffPdfRoute} calls checkRateLimit(INVOICE_PDF_DOWNLOAD_LIMIT, user.id)`,
    /\bINVOICE_PDF_DOWNLOAD_LIMIT\b/.test(rateLimitArgs) && /\buser\.id\b/.test(rateLimitArgs),
    rateLimitCallMatch ? rateLimitArgs : "checkRateLimit(...) call not found",
  ) && ok;

  // 13d. The rate-limit check happens before the first Invoice-domain
  // Prisma lookup — never after, where an unthrottled request could
  // already have paid the query cost.
  const staffRateLimitIndex = staffPdfCodeOnly.indexOf("checkRateLimit(");
  const staffInvoiceLookupIndex = staffPdfCodeOnly.indexOf("prisma.invoice.findFirst(");
  ok = report(
    `${staffPdfRoute} checks the rate limit before its first Invoice-domain Prisma lookup`,
    staffRateLimitIndex !== -1 && staffInvoiceLookupIndex !== -1 && staffRateLimitIndex < staffInvoiceLookupIndex,
    `checkRateLimit at ${staffRateLimitIndex}, prisma.invoice.findFirst at ${staffInvoiceLookupIndex}`,
  ) && ok;

  // 13e. classifyInvoiceArchival() remains the single eligibility gate.
  ok = report(
    `${staffPdfRoute} calls classifyInvoiceArchival`,
    staffPdfContent.includes("classifyInvoiceArchival"),
    "",
  ) && ok;

  // 13f. The ledger-consistency proof carries all six required
  // predicates — a targeted extraction of the invoicePdfArchiveObject
  // findFirst's own where clause, not a whole-file scan (which could be
  // satisfied by unrelated text elsewhere in the route).
  const staffLedgerCallIndex = staffPdfCodeOnly.indexOf("prisma.invoicePdfArchiveObject.findFirst(");
  const staffLedgerWhereStart = staffLedgerCallIndex === -1 ? -1 : staffPdfCodeOnly.indexOf("where: {", staffLedgerCallIndex);
  const staffLedgerWhereEnd = staffLedgerWhereStart === -1 ? -1 : staffPdfCodeOnly.indexOf("select:", staffLedgerWhereStart);
  const staffLedgerWhereBlock =
    staffLedgerWhereStart === -1 || staffLedgerWhereEnd === -1 ? "" : staffPdfCodeOnly.slice(staffLedgerWhereStart, staffLedgerWhereEnd);
  const staffLedgerRequiredPredicates = [
    "organizationId",
    "invoiceId",
    "storagePath",
    "documentVersion",
    'status: "REFERENCED"',
    "referencedAt: { not: null }",
  ];
  const staffLedgerMissingPredicates = staffLedgerRequiredPredicates.filter((p) => !staffLedgerWhereBlock.includes(p));
  ok = report(
    `${staffPdfRoute}'s ledger-consistency proof contains all six required predicates (organizationId, invoiceId, storagePath, documentVersion, status: "REFERENCED", referencedAt: { not: null })`,
    staffLedgerWhereBlock.length > 0 && staffLedgerMissingPredicates.length === 0,
    staffLedgerMissingPredicates.join(", "),
  ) && ok;

  // 13g. Rebuilds the canonical path via buildInvoicePdfStoragePath(...)
  // before ever calling the signing helper — never trusts a raw
  // persisted path as the source of truth.
  ok = report(
    `${staffPdfRoute} calls buildInvoicePdfStoragePath`,
    staffPdfContent.includes("buildInvoicePdfStoragePath"),
    "",
  ) && ok;

  const staffPathRebuildIndex = staffPdfCodeOnly.indexOf("buildInvoicePdfStoragePath(");
  const staffSignIndex = staffPdfCodeOnly.indexOf("createInvoicePdfSignedUrl(");
  ok = report(
    `${staffPdfRoute} rebuilds the canonical path before calling createInvoicePdfSignedUrl`,
    staffPathRebuildIndex !== -1 && staffSignIndex !== -1 && staffPathRebuildIndex < staffSignIndex,
    `buildInvoicePdfStoragePath at ${staffPathRebuildIndex}, createInvoicePdfSignedUrl at ${staffSignIndex}`,
  ) && ok;

  // 13h. Reuses the existing signed-URL helper — never a duplicated
  // bucket/TTL/filename/TEST_MODE/signing implementation.
  ok = report(
    `${staffPdfRoute} calls createInvoicePdfSignedUrl`,
    staffPdfContent.includes("createInvoicePdfSignedUrl"),
    "",
  ) && ok;

  // 13i. Never exposes a permanent public URL for a private-bucket
  // object.
  ok = report(
    `${staffPdfRoute} never calls getPublicUrl`,
    !staffPdfCodeOnly.includes("getPublicUrl"),
    "",
  ) && ok;

  // 13j. No console logging of any kind — generic responses only, never
  // a path/signed-URL/invoice-number/identifier printed anywhere.
  ok = report(
    `${staffPdfRoute} contains no console logging`,
    !/console\.(log|error|warn|info|debug)\(/.test(staffPdfCodeOnly),
    "",
  ) && ok;
}

process.exit(ok ? 0 : 1);
