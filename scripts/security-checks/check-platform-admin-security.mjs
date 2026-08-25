import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { grep, report } from "./lib.mjs";

/** Recursively lists .ts/.tsx files under dir — LIB_DIR is flat today but this stays correct once it grows subdirectories (e.g. queries/). */
function listTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/** Strips /** block comments before matching, so a doc comment explaining a rule in prose (e.g. "never calls getCurrentMembership()") can never trip the check meant to catch a REAL call. */
function stripBlockComments(content) {
  return content.replace(/\/\*\*[\s\S]*?\*\//g, "");
}

// Sale-Ready Phase C. Platform Admin's entire purpose is to read across
// every organization — exactly what getCurrentUserOrganization()/
// getCurrentMembership() and the (dashboard)/portal route groups exist to
// prevent everywhere else in this app. That means the isolation boundary
// here has to be enforced structurally, not just by a role check that
// could accidentally be reused somewhere it shouldn't — same discipline
// as check-search-security.mjs/check-billing-security.mjs for their own
// feature boundaries.

let ok = true;

const LIB_DIR = "src/lib/platform-admin";
const APP_DIR = "src/app/(platform-admin)";
const LAYOUT_FILE = "src/app/(platform-admin)/layout.tsx";

// Platform Admin Organization Suspension, PR 2. The one, deliberately
// reviewed exception to "no actions.ts anywhere under (platform-admin)"
// (check #6) and "no use server directive anywhere under (platform-admin)"
// (check #5) below — every other future actions.ts/"use server" file
// under this route group still fails both checks unconditionally.
const APPROVED_ACTIONS_FILE = "src/app/(platform-admin)/platform-admin/organizations/[id]/actions.ts";

// 1. Nothing under (dashboard) or portal ever imports the Platform Admin
// module — the whole point of a cross-tenant tool is that no tenant-
// scoped request path can ever reach it.
const dashboardImport = grep('from "@/lib/platform-admin', "src/app/(dashboard)");
const portalImport = grep('from "@/lib/platform-admin', "src/app/portal");
ok = report(
  "the Platform Admin module is never imported from (dashboard) or portal",
  dashboardImport === "" && portalImport === "",
  dashboardImport + portalImport,
) && ok;

// 2. The (platform-admin) layout — the single point every page in the
// group renders through — actually calls requirePlatformAdmin(). Guarded
// once here, not repeated per-page, the same "guard lives in the layout"
// pattern (dashboard)/layout.tsx already uses for its own portal-identity
// check.
const layoutContent = readFileSync(LAYOUT_FILE, "utf8");
const importsGuard = /import\s*\{[^}]*\brequirePlatformAdmin\b[^}]*\}\s*from\s*"@\/lib\/platform-admin\/authorization"/.test(
  layoutContent,
);
const callsGuard = layoutContent.includes("requirePlatformAdmin(");
ok = report(
  "the (platform-admin) layout imports and calls requirePlatformAdmin()",
  importsGuard && callsGuard,
  "",
) && ok;

// 3. Platform Admin queries never scope to one organization — a real call
// to getCurrentUserOrganization()/getCurrentMembership() here would mean
// this module has quietly started depending on "active organization,"
// exactly the single-tenant assumption it must never make. Block comments
// stripped first so a doc comment explaining this very rule in prose (as
// authorization.ts's own does) can never trip the check meant to catch a
// REAL call.
const libFiles = listTsFiles(LIB_DIR);
const forbiddenIdentityPattern = /getCurrentUserOrganization\(|getCurrentMembership\(/;
const filesCallingForbiddenIdentity = libFiles.filter((f) => forbiddenIdentityPattern.test(stripBlockComments(readFileSync(f, "utf8"))));
ok = report(
  "src/lib/platform-admin never calls getCurrentUserOrganization/getCurrentMembership",
  filesCallingForbiddenIdentity.length === 0,
  filesCallingForbiddenIdentity.join(", "),
) && ok;

// 4. No raw query anywhere in the module. Phase C's whole query surface is
// plain Prisma — if this ever needs to change (e.g. a future Platform
// Health PR reading Prisma's own _prisma_migrations table), that's a
// deliberate, reviewed exception, not something that should silently pass
// this check.
const rawQueryPattern = /\$queryRaw|\$executeRaw/;
const filesWithRawQueries = libFiles.filter((f) => rawQueryPattern.test(stripBlockComments(readFileSync(f, "utf8"))));
ok = report("no raw query anywhere in src/lib/platform-admin", filesWithRawQueries.length === 0, filesWithRawQueries.join(", ")) && ok;

// 5. No "use server" directive anywhere under src/lib/platform-admin or
// src/app/(platform-admin) — Sale-Ready Phase C, PR3's own explicit
// "read-only, no mutations, no server actions" requirement, made
// structural rather than a code-review hope. A real directive is always
// the first non-empty line of a file, quoted with either quote style —
// checking that (not just "the string appears anywhere") means a file
// that merely *mentions* "use server" in a comment explaining why it
// deliberately has none can never trip this.
const appFiles = listTsFiles(APP_DIR);
const useServerPattern = /^["']use server["'];?\s*$/;
function firstNonEmptyLine(content) {
  return content.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
const filesWithUseServer = [...libFiles, ...appFiles].filter((f) => useServerPattern.test(firstNonEmptyLine(readFileSync(f, "utf8"))));
const unapprovedFilesWithUseServer = filesWithUseServer.filter((f) => f !== APPROVED_ACTIONS_FILE);
ok = report(
  'no "use server" directive anywhere in src/lib/platform-admin or src/app/(platform-admin), except the one approved Organization Suspension actions.ts',
  unapprovedFilesWithUseServer.length === 0,
  unapprovedFilesWithUseServer.join(", "),
) && ok;
ok = report(
  'the approved Organization Suspension actions.ts genuinely begins with "use server"',
  filesWithUseServer.includes(APPROVED_ACTIONS_FILE),
  "",
) && ok;

// 6. No actions.ts file anywhere under src/app/(platform-admin) — the
// same "the absence of a mutation surface is itself auditable" property
// PR1 established (no actions.ts existed at all in the Foundation),
// extended to cover every route this and future Phase C PRs add.
//
// Platform Admin Organization Suspension, PR 2 — the first deliberate,
// reviewed exception: exactly one actions.ts, at exactly the reviewed
// path (APPROVED_ACTIONS_FILE above), is now permitted. Any other
// actions.ts anywhere else under this route group still fails this
// check unconditionally — this is not a general loosening, only a
// single named file is ever exempted.
const actionsFiles = appFiles.filter((f) => f.endsWith("/actions.ts") || f.endsWith("\\actions.ts"));
const unapprovedActionsFiles = actionsFiles.filter((f) => f !== APPROVED_ACTIONS_FILE);
ok = report(
  "no actions.ts file anywhere under src/app/(platform-admin) except the one approved Organization Suspension module",
  unapprovedActionsFiles.length === 0,
  unapprovedActionsFiles.join(", "),
) && ok;
ok = report(
  "the approved Organization Suspension actions.ts exists at exactly the reviewed path",
  actionsFiles.includes(APPROVED_ACTIONS_FILE),
  "",
) && ok;

// PLATFORM_ADMIN_EXECUTION_AUTHORIZATION_AUDIT correction (checks 7-9
// below). Root cause: Next.js renders layouts and pages in parallel by
// default (this repo's installed docs, node_modules/next/dist/docs/
// 01-app/01-getting-started/06-fetching-data.md, "Parallel data
// fetching") — the layout calling requirePlatformAdmin() (check #2,
// above) protects the final HTTP response, but does NOT stop a child
// data-reader's own Prisma calls from executing first. The fix is a
// second, execution-level call to the same cache()-memoized
// requirePlatformAdmin(), as the first awaited statement inside every
// data-bearing entry point. Checks #7-#8 make that convention structural.
//
// RECONCILIATION (post-merge hardening pass, before PR #119 merged):
// the first version of checks #7-#8 used a custom brace/regex parser to
// find "export async function NAME(...) { ... }" and its first
// statement. Two gaps were found in review:
//
//  1. It only matched the `export async function` declaration shape —
//     `export const name = async (...) => { ... }` (or a function
//     expression) was never even scanned, so a future data-reader
//     written that way could omit the guard entirely without failing
//     any check — a real, syntax-shaped bypass, not a hypothetical one.
//  2. The regex claiming "no Server Action/API route can be added
//     without this check failing" (formerly written here) was false:
//     checks #5/#6 only ban a "use server" directive and an actions.ts
//     file — neither is required by a Route Handler (route.ts), which
//     could be added under this route group with its own, entirely
//     unchecked authorization story.
//
// Both are fixed below: #7/#8 now use the TypeScript compiler API
// (already an installed devDependency — no new package, no lockfile
// change) to parse each file into a real AST and walk its top-level
// statements, rather than pattern-matching text. This closes gap 2
// structurally (an AST distinguishes a function declaration from a
// const-assigned async arrow/function-expression the same way either
// way, and is never confused by a `{`/`}` inside a string, a template
// literal, or a return-type object literal — the exact case,
// `Promise<{ organizations: ...; total: number }>`, that broke the
// original regex parser during development). It also fails closed on
// any exported construct it cannot classify (a local re-export, a
// `export * from`, an exported class, or `export default <expression>`)
// rather than silently ignoring it. Check #9 is new and fixes gap 1.

const QUERIES_DIR = "src/lib/platform-admin/queries";
const CONFIGURATION_PAGE_FILE = "src/app/(platform-admin)/platform-admin/configuration/page.tsx";
const GUARD_MODULE_SPECIFIER = "@/lib/platform-admin/authorization";
const GUARD_NAME = "requirePlatformAdmin";

function parseTsFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
}

function hasModifier(node, kind) {
  return (node.modifiers ?? []).some((m) => m.kind === kind);
}
const isAsync = (node) => hasModifier(node, ts.SyntaxKind.AsyncKeyword);
const isExported = (node) => hasModifier(node, ts.SyntaxKind.ExportKeyword);

/** Local names imported from exactly GUARD_MODULE_SPECIFIER in this file — never from a differently-named or differently-sourced lookalike. */
function namesImportedFromGuardModule(sourceFile) {
  const names = new Set();
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== GUARD_MODULE_SPECIFIER) continue;
    const clause = stmt.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    for (const el of clause.namedBindings.elements) names.add(el.name.text);
  }
  return names;
}

/** True only when a function/arrow body is a real block whose first statement is `await requirePlatformAdmin();`, where that identifier was actually imported from the canonical module in this same file (not merely present as text anywhere). */
function isGuardAwaitExpression(expr, guardNames) {
  if (!expr || expr.kind !== ts.SyntaxKind.AwaitExpression) return false;
  const call = expr.expression;
  if (!call || !ts.isCallExpression(call)) return false;
  if (!ts.isIdentifier(call.expression)) return false;
  return call.expression.text === GUARD_NAME && guardNames.has(GUARD_NAME);
}

/**
 * True when the first real statement is the guard call, in either shape
 * this codebase actually uses: a bare, discarded `await
 * requirePlatformAdmin();` (every query/Configuration entry point), or a
 * destructured/assigned `const { email } = await requirePlatformAdmin();`
 * (every entry point that needs the returned identity — e.g. an audit-
 * logging Server Action) — the exact same call, first, either way; only
 * whether its return value is kept differs, which this check must not
 * treat as "unguarded."
 */
function bodyOpensWithGuardCall(body, guardNames) {
  if (!body || !ts.isBlock(body)) return false;
  const first = body.statements[0];
  if (!first) return false;

  if (ts.isExpressionStatement(first)) {
    return isGuardAwaitExpression(first.expression, guardNames);
  }

  if (ts.isVariableStatement(first)) {
    const declarations = first.declarationList.declarations;
    if (declarations.length !== 1) return false;
    return isGuardAwaitExpression(declarations[0].initializer, guardNames);
  }

  return false;
}

/** A literal-shaped initializer this check can prove is not, and cannot expose, a callable (plain data — arrays, objects, strings, numbers, booleans, `as const`/`satisfies`-wrapped versions of any of those). */
function isDefinitelyNonCallableLiteral(expr) {
  switch (expr.kind) {
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateExpression:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.ArrayLiteralExpression:
    case ts.SyntaxKind.ObjectLiteralExpression:
      return true;
    case ts.SyntaxKind.AsExpression:
    case ts.SyntaxKind.SatisfiesExpression:
      return isDefinitelyNonCallableLiteral(expr.expression);
    default:
      return false;
  }
}

/**
 * Walks every top-level statement in a file and returns:
 *  - entryPoints: [{name, guarded}] for every exported async callable
 *    this check can verify — a function declaration (`export async
 *    function f() {}` / `export default async function f() {}`) or a
 *    const/let assigned an async arrow or function expression
 *    (`export const f = async () => {}`);
 *  - unsupported: description strings for any exported construct this
 *    check cannot classify as safe: an exported class, a local
 *    re-export or `export * from` (ExportDeclaration), an
 *    `export default <expression>` that isn't itself a function
 *    declaration (ExportAssignment), an exported destructured binding,
 *    or an exported const whose initializer isn't a provably-inert
 *    literal and isn't a directly-defined async/non-async function —
 *    e.g. `export const alias = someOtherFunction;`, which could expose
 *    a new entry point through an indirect reference this check cannot
 *    trace. Reported and failed on, never silently ignored — the fix
 *    for gap 2 (only "export async function" was previously scanned).
 *
 * A synchronous exported function/arrow (no `async` modifier) is never
 * added to either list — a pure classifier/reducer/formatter (e.g.
 * classifyOrganizationLifecycle, buildOrganizationWhere) has nothing to
 * authenticate, and requiring it to would be exactly the "redundant
 * verification without justification" this convention's own design
 * rejected. A type alias, interface, or non-function exported constant
 * (a real constant like ORGANIZATION_LIFECYCLE_STATUSES) is likewise
 * never flagged — proven inert by isDefinitelyNonCallableLiteral, or by
 * not matching any of the statement kinds this function inspects at all.
 */
function analyzeExportedAsyncCallables(sourceFile) {
  const guardNames = namesImportedFromGuardModule(sourceFile);
  const entryPoints = [];
  const unsupported = [];

  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && isExported(stmt)) {
      if (isAsync(stmt)) {
        const name = stmt.name?.text ?? "(default export)";
        entryPoints.push({ name, guarded: bodyOpensWithGuardCall(stmt.body, guardNames) });
      }
      continue;
    }
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) {
          unsupported.push(`exported destructured declaration: ${stmt.getText(sourceFile).slice(0, 80)}`);
          continue;
        }
        const init = decl.initializer;
        if (!init) continue;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          if (!isAsync(init)) continue; // pure sync helper written as a const — exempt, same as a sync function declaration
          entryPoints.push({ name: decl.name.text, guarded: bodyOpensWithGuardCall(init.body, guardNames) });
          continue;
        }
        if (isDefinitelyNonCallableLiteral(init)) continue; // a real constant, not a callable
        unsupported.push(`exported const with an unverifiable initializer: ${decl.name.text} = ${init.getText(sourceFile).slice(0, 60)}`);
      }
      continue;
    }
    if (ts.isClassDeclaration(stmt) && isExported(stmt)) {
      unsupported.push(`exported class: ${stmt.name?.text ?? "(anonymous)"}`);
      continue;
    }
    if (ts.isExportDeclaration(stmt)) {
      unsupported.push(`export declaration: ${stmt.getText(sourceFile).slice(0, 80)}`);
      continue;
    }
    if (ts.isExportAssignment(stmt)) {
      unsupported.push(`export default expression: ${stmt.getText(sourceFile).slice(0, 80)}`);
      continue;
    }
    // Type aliases, interfaces, and any non-exported statement are
    // outside this check's scope by construction — never a data-reader
    // entry point.
  }

  return { entryPoints, unsupported };
}

// 7. Every exported async callable in src/lib/platform-admin/queries/
// (the query modules' own external entry points), regardless of
// function-declaration vs. async-arrow/function-expression syntax, calls
// the canonical requirePlatformAdmin() as its first awaited statement,
// imported from exactly the real module. A module-private async helper
// (e.g. organizations.ts's own getPortalUserCountsByOrganization) is
// never matched (no `export` keyword) — deliberately: it's protected
// transitively by its own sole caller's guard, not independently
// reachable, and requiring a second check here would be exactly the
// "redundant verification without justification" the investigation's
// own design explicitly rejected.
const queryFiles = listTsFiles(QUERIES_DIR);
const missingGuardEntryPoints = [];
const unsupportedQueryExports = [];
for (const file of queryFiles) {
  const { entryPoints, unsupported } = analyzeExportedAsyncCallables(parseTsFile(file));
  for (const { name, guarded } of entryPoints) {
    if (!guarded) missingGuardEntryPoints.push(`${file}:${name}`);
  }
  for (const detail of unsupported) unsupportedQueryExports.push(`${file}: ${detail}`);
}
ok = report(
  "every exported async callable in src/lib/platform-admin/queries/ calls requirePlatformAdmin() as its first awaited statement",
  missingGuardEntryPoints.length === 0,
  missingGuardEntryPoints.join(", "),
) && ok;
ok = report(
  "src/lib/platform-admin/queries/ has no exported construct this check cannot verify (no re-export, exported class, or export-default-expression)",
  unsupportedQueryExports.length === 0,
  unsupportedQueryExports.join(", "),
) && ok;

// 8. The Configuration page is the one deliberate exception to "the guard
// lives inside the data-reader" — its six readers (platform-config.ts,
// platform-billing-config.ts) are shared with fully public pages
// (/privacy, /terms, the site-wide footer) or with tenant checkout
// Server Actions, so guarding them directly would be a regression, not a
// fix (see the Configuration page's own doc comment). This page is
// therefore explicitly allowlisted as its own protected entry point,
// analyzed the same way as #7's query functions (the page's default
// export is itself an `export default async function`, so the same
// analyzer applies directly).
const { entryPoints: configPageEntryPoints, unsupported: unsupportedConfigExports } = analyzeExportedAsyncCallables(
  parseTsFile(CONFIGURATION_PAGE_FILE),
);
const configPageDefaultExport = configPageEntryPoints.find((e) => e.name !== "(default export)") ?? configPageEntryPoints[0];
ok = report(
  "the Configuration page calls requirePlatformAdmin() as its first awaited statement (its readers are shared and cannot be guarded directly)",
  configPageEntryPoints.length > 0 && configPageEntryPoints.every((e) => e.guarded),
  configPageDefaultExport ? "" : "no exported async function found in the Configuration page",
) && ok;
ok = report(
  "the Configuration page has no exported construct this check cannot verify",
  unsupportedConfigExports.length === 0,
  unsupportedConfigExports.join(", "),
) && ok;

// 9. No route.ts (API Route Handler) anywhere under src/app/(platform-
// admin) — closes the gap checks #5/#6 alone leave open: neither a "use
// server" directive nor an actions.ts file is required to add a Route
// Handler, so it was previously possible to add one with an entirely
// unchecked authorization story. Prohibited outright, the same
// fail-closed "the absence of a construct is itself auditable" pattern
// check #6 already uses for actions.ts — no route.ts exists anywhere in
// this route group today, so this costs nothing now, and a future PR
// that genuinely needs one must update this script with that
// construct's own explicit, reviewed authorization convention (e.g. its
// own requirePlatformAdmin() call, verified the same deliberate way) as
// part of the same change, not add it silently.
const routeHandlerFiles = appFiles.filter((f) => f.endsWith("/route.ts") || f.endsWith("\\route.ts"));
ok = report(
  "no route.ts (API Route Handler) file anywhere under src/app/(platform-admin)",
  routeHandlerFiles.length === 0,
  routeHandlerFiles.join(", "),
) && ok;

// 10. Platform Admin Organization Suspension, PR 2. The approved
// actions.ts (checks #5/#6's own named exception, above) is analyzed by
// the exact same AST-based analyzer checks #7/#8 already apply to
// src/lib/platform-admin/queries/*.ts and the Configuration page:
// suspendOrganizationAction/reactivateOrganizationAction must each call
// requirePlatformAdmin() as their first awaited statement, imported from
// exactly the canonical module — never a same-named import from
// anywhere else, never satisfied by an alias/re-export/exported class/
// export-default-expression this analyzer cannot verify. This is the
// entire enforcement mechanism check #6 above's exception depends on:
// a Platform Admin actions.ts is permitted to exist at all only because
// this check exists to keep proving its own execution-level guard.
const { entryPoints: actionEntryPoints, unsupported: unsupportedActionExports } = analyzeExportedAsyncCallables(
  parseTsFile(APPROVED_ACTIONS_FILE),
);
ok = report(
  "every exported async action in the approved Organization Suspension actions.ts calls requirePlatformAdmin() as its first awaited statement",
  actionEntryPoints.length > 0 && actionEntryPoints.every((e) => e.guarded),
  actionEntryPoints
    .filter((e) => !e.guarded)
    .map((e) => e.name)
    .join(", "),
) && ok;
ok = report(
  "the approved Organization Suspension actions.ts has no exported construct this check cannot verify",
  unsupportedActionExports.length === 0,
  unsupportedActionExports.join(", "),
) && ok;

process.exit(ok ? 0 : 1);
