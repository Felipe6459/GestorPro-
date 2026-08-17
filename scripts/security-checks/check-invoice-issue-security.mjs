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

// 8d. The Issue service's own calls to deps.upload/deps.remove pass an
// `identity`, never a raw `path` — the caller side of the same boundary.
if (existsSync(serviceFile)) {
  const serviceContent = readFileSync(serviceFile, "utf8");
  const uploadCallMatch = serviceContent.match(/deps\.upload\(\{([^}]*)\}\)/);
  const removeCallMatches = [...serviceContent.matchAll(/deps\.remove\(\{([^}]*)\}\)/g)];
  ok = report(
    "issue-invoice.ts's own deps.upload(...) call passes { identity, body }, never a raw path",
    !!uploadCallMatch && /\bidentity\b/.test(uploadCallMatch[1]) && !/\bpath\s*:/.test(uploadCallMatch[1]),
    uploadCallMatch ? uploadCallMatch[1] : "deps.upload(...) call not found",
  ) && ok;
  ok = report(
    "every issue-invoice.ts deps.remove(...) call passes { identity }, never a raw path",
    removeCallMatches.length > 0 && removeCallMatches.every(([, args]) => /\bidentity\b/.test(args) && !/\bpath\s*:/.test(args)),
    removeCallMatches.map(([, args]) => args).join(" | ") || "deps.remove(...) call not found",
  ) && ok;
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

// 11. No Portal PDF route was introduced in this sub-PR — that remains a
// later sub-PR's.
const portalPdfRoute = "src/app/api/portal/invoices";
ok = report(
  `${portalPdfRoute} does not exist yet (out of scope for this sub-PR)`,
  !existsSync(portalPdfRoute),
  existsSync(portalPdfRoute) ? `Found ${portalPdfRoute} — Portal PDF access is a later sub-PR's.` : "",
) && ok;

process.exit(ok ? 0 : 1);
