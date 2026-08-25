import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Platform Admin Organization Suspension — expected-name discoverability
 * hotfix. A genuine AST contract test proving the Organization Detail
 * page's own <h1> (the primary, page-level rendering of the exact
 * organization name the Suspend dialog's confirmation depends on) wraps
 * a long or unbroken name safely instead of overflowing/squeezing past
 * its row, and is never truncated. Same technique as
 * organization-suspension-controls-hardening.test.ts: parse the real,
 * committed source with the TypeScript Compiler API rather than
 * reimplementing or rendering it.
 */

const PAGE_FILE = "src/app/(platform-admin)/platform-admin/organizations/[id]/page.tsx";

function parsePageFile(): ts.SourceFile {
  const content = readFileSync(PAGE_FILE, "utf8");
  return ts.createSourceFile(PAGE_FILE, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function isOrganizationNameExpressionChild(child: ts.JsxChild): boolean {
  if (!ts.isJsxExpression(child) || !child.expression) return false;
  // organization.name is a PropertyAccessExpression, not a bare
  // identifier — matched on its exact source text rather than
  // isIdentifier() (which the sibling reference-block test in
  // organization-suspension-controls-hardening.test.ts uses for the
  // prop-named `organizationName` identifier instead).
  return child.expression.getText().trim() === "organization.name";
}

function findHeading(sourceFile: ts.SourceFile): ts.JsxElement {
  let found: ts.JsxElement | undefined;
  function visit(node: ts.Node) {
    if (found) return;
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === "h1" && node.children.some(isOrganizationNameExpressionChild)) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!found) {
    throw new Error(`No <h1> rendering {organization.name} found in ${PAGE_FILE} — the page header may have been restructured.`);
  }
  return found;
}

function classNameOf(element: ts.JsxElement): string {
  for (const prop of element.openingElement.attributes.properties) {
    if (!ts.isJsxAttribute(prop) || prop.name.getText() !== "className") continue;
    const init = prop.initializer;
    if (init && ts.isStringLiteral(init)) return init.text;
  }
  return "";
}

describe("Organization Detail page — the <h1> organization name wraps safely", () => {
  const sourceFile = parsePageFile();

  it("has min-w-0 — lets this flex item actually shrink below its content's intrinsic width instead of squeezing the row", () => {
    expect(classNameOf(findHeading(sourceFile))).toMatch(/\bmin-w-0\b/);
  });

  it("has wrap-anywhere (overflow-wrap: anywhere) — a long or unbroken name wraps onto further lines instead of overflowing, and (unlike break-words) this is respected by the flex item's own min-content sizing", () => {
    expect(classNameOf(findHeading(sourceFile))).toMatch(/\bwrap-anywhere\b/);
  });

  it("is never truncated, ellipsized, or line-clamped", () => {
    const className = classNameOf(findHeading(sourceFile));
    expect(className).not.toMatch(/\btruncate\b|\bline-clamp-\d+\b|\btext-ellipsis\b|\bwhitespace-nowrap\b/);
  });

  it("still renders organization.name verbatim — no formatting/transformation wraps it", () => {
    const heading = findHeading(sourceFile);
    const expressionChildren = heading.children.filter((c) => ts.isJsxExpression(c));
    expect(expressionChildren).toHaveLength(1);
  });
});
