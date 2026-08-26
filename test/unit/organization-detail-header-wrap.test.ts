import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Platform Admin Organization Suspension — Organization Detail page
 * contract tests. Two related concerns, both AST-verified against the
 * real, committed source (same technique as organization-suspension-
 * controls-hardening.test.ts, rather than reimplementing or rendering
 * it):
 *
 *  1. The page's own <h1> (the primary, page-level rendering of
 *     Organization.name) wraps a long or unbroken name safely instead
 *     of overflowing/squeezing past its row, and is never truncated —
 *     from the expected-name discoverability hotfix.
 *
 *  2. ORGANIZATION_IDENTITY_CONFIRMATION_DESIGN correction: the
 *     "Organization" DetailSection's new "Name" Field is the one
 *     permanent, always-labeled home for the full Organization.name —
 *     no longer duplicated inside the Suspend dialog (see
 *     organization-suspension-controls-hardening.test.ts's own coverage
 *     of that removal).
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

function findDetailSection(sourceFile: ts.SourceFile, sectionId: string): ts.JsxElement {
  let found: ts.JsxElement | undefined;
  function visit(node: ts.Node) {
    if (found) return;
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === "DetailSection") {
      const idAttr = node.openingElement.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === "id");
      if (idAttr && ts.isJsxAttribute(idAttr) && idAttr.initializer && ts.isStringLiteral(idAttr.initializer) && idAttr.initializer.text === sectionId) {
        found = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!found) {
    throw new Error(`No DetailSection with id="${sectionId}" found in ${PAGE_FILE}.`);
  }
  return found;
}

/** Every self-closing <Field .../> element directly inside a DetailSection, in source order. */
function findFieldElements(section: ts.JsxElement): ts.JsxSelfClosingElement[] {
  const fields: ts.JsxSelfClosingElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === "Field") {
      fields.push(node);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(section);
  return fields;
}

function fieldAttributeText(field: ts.JsxSelfClosingElement, name: string, sourceFile: ts.SourceFile): string | null {
  for (const prop of field.attributes.properties) {
    if (!ts.isJsxAttribute(prop) || prop.name.getText() !== name) continue;
    const init = prop.initializer;
    if (!init) return "true";
    if (ts.isStringLiteral(init)) return init.text;
    if (ts.isJsxExpression(init) && init.expression) return init.expression.getText(sourceFile);
    return null;
  }
  return null;
}

describe("Organization Detail page — the 'Organization' section's new Name field", () => {
  const sourceFile = parsePageFile();
  const section = findDetailSection(sourceFile, "organization");
  const fields = findFieldElements(section);

  it("has Name as the very first field in the section", () => {
    expect(fields.length).toBeGreaterThan(0);
    expect(fieldAttributeText(fields[0], "label", sourceFile)).toBe("Name");
  });

  it("renders organization.name verbatim in the Name field's own value", () => {
    const value = fieldAttributeText(fields[0], "value", sourceFile);
    expect(value).not.toBeNull();
    expect(value).toContain("organization.name");
  });

  it("makes the Name field's value manually selectable via select-all", () => {
    const value = fieldAttributeText(fields[0], "value", sourceFile);
    expect(value).toMatch(/\bselect-all\b/);
  });

  it("preserves every existing identity field afterward, in order: Created, Slug, Owner, Staff users, Portal users", () => {
    const labels = fields.map((f) => fieldAttributeText(f, "label", sourceFile));
    expect(labels).toEqual(["Name", "Created", "Slug", "Owner", "Staff users", "Portal users"]);
  });

  it("does not introduce a second 'Display name' label inside this section (Business Identity's own field already uses that exact label for the same underlying value)", () => {
    const labels = fields.map((f) => fieldAttributeText(f, "label", sourceFile));
    expect(labels).not.toContain("Display name");
  });

  it("never exposes the organization's own id, an actor email, or audit data from this new field", () => {
    const value = fieldAttributeText(fields[0], "value", sourceFile);
    expect(value).not.toMatch(/organization\.id\b|actorEmail|audit/i);
  });
});
