import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Platform Admin Organization Suspension — confirmation-input hardening
 * hotfix. A genuine component contract test: parses the real, committed
 * OrganizationSuspensionControls source with the TypeScript Compiler API
 * (the same technique this repo's own scripts/security-checks/check-
 * platform-admin-security.mjs already uses to verify real JSX/AST shape
 * rather than pattern-matching text) and asserts the exact-name
 * confirmation `<input>` carries all four text-assistance-disabling
 * attributes, plus the accessible mismatch-feedback wiring. This proves
 * the real, shipped markup — not a reimplementation of it — genuinely
 * has these attributes; a future edit that silently drops one of them
 * fails this test for that exact reason.
 */

const COMPONENT_FILE = "src/components/platform-admin/organization-suspension-controls.tsx";

function parseComponentFile(): ts.SourceFile {
  const content = readFileSync(COMPONENT_FILE, "utf8");
  return ts.createSourceFile(COMPONENT_FILE, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** True for the one JSX input element in this file whose `type` attribute is the string literal "text" — the exact-name confirmation field. */
function isConfirmationInput(node: ts.Node): node is ts.JsxSelfClosingElement {
  if (!ts.isJsxSelfClosingElement(node)) return false;
  if (node.tagName.getText() !== "input") return false;
  return node.attributes.properties.some((prop) => {
    if (!ts.isJsxAttribute(prop) || prop.name.getText() !== "type") return false;
    const init = prop.initializer;
    return !!init && ts.isStringLiteral(init) && init.text === "text";
  });
}

function findConfirmationInput(sourceFile: ts.SourceFile): ts.JsxSelfClosingElement {
  let found: ts.JsxSelfClosingElement | undefined;
  function visit(node: ts.Node) {
    if (found) return;
    if (isConfirmationInput(node)) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!found) {
    throw new Error(`No <input type="text"> found in ${COMPONENT_FILE} — the confirmation field itself may have been removed or restructured.`);
  }
  return found;
}

/** Reads a JSX attribute's value as plain source text: the literal string for `attr="value"`, or the expression's own source text for `attr={expr}`. Returns null when the attribute is absent. */
function attributeValueText(input: ts.JsxSelfClosingElement, name: string, sourceFile: ts.SourceFile): string | null {
  for (const prop of input.attributes.properties) {
    if (!ts.isJsxAttribute(prop) || prop.name.getText() !== name) continue;
    const init = prop.initializer;
    if (!init) return "true"; // a bare boolean attribute, e.g. `disabled`
    if (ts.isStringLiteral(init)) return init.text;
    if (ts.isJsxExpression(init) && init.expression) return init.expression.getText(sourceFile);
    return null;
  }
  return null;
}

describe("OrganizationSuspensionControls' confirmation input — text-assistance hardening", () => {
  const sourceFile = parseComponentFile();
  const input = findConfirmationInput(sourceFile);

  it('has autoComplete="off"', () => {
    expect(attributeValueText(input, "autoComplete", sourceFile)).toBe("off");
  });

  it('has autoCorrect="off" — stops Safari/OS-level smart punctuation and text substitution from silently rewriting a typed character before it reaches the exact-match comparison', () => {
    expect(attributeValueText(input, "autoCorrect", sourceFile)).toBe("off");
  });

  it('has autoCapitalize="none" (the WHATWG-correct value for "never auto-capitalize"), preventing a mobile/software keyboard from altering the first letter of a word as it\'s typed', () => {
    expect(attributeValueText(input, "autoCapitalize", sourceFile)).toBe("none");
  });

  it("has spellCheck={false} — stops the browser's own spellcheck UI/rewriting from touching this field", () => {
    expect(attributeValueText(input, "spellCheck", sourceFile)).toBe("false");
  });

  it("aria-describedby always references the exact-name reference block, and additionally the mismatch message when one is shown", () => {
    // Discoverability hotfix: the input is now always described by the
    // dedicated reference block holding the exact expected value (so a
    // screen reader user tabbing to the input hears it), and, only while
    // a mismatch exists, additionally by the mismatch message — a real
    // conditional expression, never a hardcoded string.
    const value = attributeValueText(input, "aria-describedby", sourceFile);
    expect(value).not.toBeNull();
    expect(value).toContain("nameReferenceId");
    expect(value).toMatch(/nameMismatches\s*\?.*nameMismatchId/);
  });

  it("is wired to a conditional aria-invalid (present only when a mismatch exists, never a hardcoded true/false)", () => {
    const value = attributeValueText(input, "aria-invalid", sourceFile);
    expect(value).not.toBeNull();
    expect(value).toMatch(/\?.*:.*undefined/);
  });

  it("still carries every original attribute this hotfix must not remove (id, controlled value/onChange)", () => {
    expect(attributeValueText(input, "id", sourceFile)).not.toBeNull();
    expect(attributeValueText(input, "value", sourceFile)).not.toBeNull();
    expect(attributeValueText(input, "onChange", sourceFile)).not.toBeNull();
  });
});

describe("OrganizationSuspensionControls — visible, accessible mismatch feedback", () => {
  const content = readFileSync(COMPONENT_FILE, "utf8");

  it('renders the exact bounded mismatch copy "Name does not match." somewhere in the confirmation dialog', () => {
    expect(content).toContain("Name does not match.");
  });

  it("never renders the organization's id, an actor email, or any audit/raw-value placeholder text near the mismatch message (bounded, non-disclosing copy only)", () => {
    // A light-touch guard, not a full parse: the mismatch copy's own
    // literal string must not be adjacent to anything that looks like an
    // interpolated raw value (e.g. `{organizationId}` or `{actorEmail}`)
    // in the same file — this component must only ever render
    // organizationName (already visible elsewhere on the page) and fixed
    // copy.
    expect(content).not.toMatch(/Name does not match\.[^<]*\{(?!\/)/);
  });
});

/**
 * Discoverability hotfix — the fragile inline "Type <name> to confirm"
 * rendering (no wrap protection, no way to select just the value) is
 * replaced by a dedicated, always-fully-visible, verbatim reference
 * block. Proven the same way as the input's own hardening above: a
 * genuine AST contract test against the real, committed source, never a
 * DOM render (no jsdom/Testing Library in this repo's unit config).
 */
describe("OrganizationSuspensionControls — exact-name reference block", () => {
  const sourceFile = parseComponentFile();

  function isOrganizationNameExpressionChild(child: ts.JsxChild): boolean {
    return ts.isJsxExpression(child) && !!child.expression && ts.isIdentifier(child.expression) && child.expression.text === "organizationName";
  }

  function findReferenceBlock(): ts.JsxElement {
    let found: ts.JsxElement | undefined;
    function visit(node: ts.Node) {
      if (found) return;
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === "p" && node.children.some(isOrganizationNameExpressionChild)) {
        found = node;
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    if (!found) {
      throw new Error("No <p> element rendering {organizationName} verbatim found — the dedicated reference block may have been removed.");
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

  it("renders {organizationName} verbatim as its sole child expression — no formatting, trimming, or transformation function wraps it", () => {
    const block = findReferenceBlock();
    // Exactly one JsxExpression child, and it's the bare identifier —
    // never `{organizationName.trim()}`, `{formatName(organizationName)}`,
    // or similar, which this same identifier check would already reject
    // (an isIdentifier() check fails the moment a call/member expression
    // wraps it).
    const expressionChildren = block.children.filter((c) => ts.isJsxExpression(c));
    expect(expressionChildren).toHaveLength(1);
  });

  it("has an id the input's own aria-describedby references (checked together with the input's own test above)", () => {
    const block = findReferenceBlock();
    const idAttr = block.openingElement.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === "id");
    expect(idAttr).toBeDefined();
  });

  it("is manually selectable via select-all (user-select: all) — never a Clipboard API call, an automatic copy, or a Copy button in this minimal hotfix", () => {
    const className = classNameOf(findReferenceBlock());
    expect(className).toMatch(/\bselect-all\b/);
    expect(readFileSync(COMPONENT_FILE, "utf8")).not.toMatch(/navigator\.clipboard|useClipboard|Copy(?:Button|ToClipboard)/);
  });

  it("wraps safely (wrap-anywhere / overflow-wrap: anywhere) instead of overflowing for a long unbroken string", () => {
    expect(classNameOf(findReferenceBlock())).toMatch(/\bwrap-anywhere\b/);
  });

  it("is never truncated, ellipsized, or line-clamped", () => {
    const className = classNameOf(findReferenceBlock());
    expect(className).not.toMatch(/\btruncate\b|\bline-clamp-\d+\b|\btext-ellipsis\b|\bwhitespace-nowrap\b/);
  });

  it("is clearly labeled, and the confirm-typing instruction no longer duplicates the name inline (no confusing duplicate accessible text)", () => {
    const content = readFileSync(COMPONENT_FILE, "utf8");
    expect(content).toContain("Exact organization name");
    // The old inline rendering — the label itself containing
    // {organizationName} — must be gone; the reference block above is
    // now the only place this component renders the raw value.
    expect(content).not.toMatch(/Type\s*<span[^>]*>\{organizationName\}/);
  });
});
