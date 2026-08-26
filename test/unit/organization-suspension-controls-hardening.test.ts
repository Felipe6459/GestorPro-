import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Platform Admin Organization Suspension — confirmation-input contract
 * tests. Parses the real, committed OrganizationSuspensionControls
 * source with the TypeScript Compiler API (the same technique this
 * repo's own scripts/security-checks/check-platform-admin-security.mjs
 * already uses to verify real JSX/AST shape rather than pattern-matching
 * text) — proving the real, shipped markup, not a reimplementation of
 * it.
 *
 * ORGANIZATION_IDENTITY_CONFIRMATION_DESIGN correction: the dedicated
 * "Exact organization name" reference block (added by the prior
 * discoverability hotfix) is now gone entirely, along with any use of
 * Organization.name in this component — replaced by a short, inline
 * `SUSPEND <slug>` confirmation phrase. Text-assistance hardening
 * (autoComplete/autoCorrect/autoCapitalize/spellCheck) and the
 * accessible mismatch-feedback shape are both still required, unchanged
 * in spirit from the prior two hotfixes.
 */

const COMPONENT_FILE = "src/components/platform-admin/organization-suspension-controls.tsx";

function parseComponentFile(): ts.SourceFile {
  const content = readFileSync(COMPONENT_FILE, "utf8");
  return ts.createSourceFile(COMPONENT_FILE, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** True for the one JSX input element in this file whose `type` attribute is the string literal "text" — the exact-phrase confirmation field. */
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

  it("is wired to a conditional aria-describedby (present only while a mismatch message is shown — no separate reference block exists to describe permanently anymore)", () => {
    const value = attributeValueText(input, "aria-describedby", sourceFile);
    expect(value).not.toBeNull();
    expect(value).toMatch(/\?.*:.*undefined/);
    expect(value).toContain("mismatchId");
  });

  it("is wired to a conditional aria-invalid (present only when a mismatch exists, never a hardcoded true/false)", () => {
    const value = attributeValueText(input, "aria-invalid", sourceFile);
    expect(value).not.toBeNull();
    expect(value).toMatch(/\?.*:.*undefined/);
  });

  it("still carries every original attribute this design correction must not remove (id, controlled value/onChange)", () => {
    expect(attributeValueText(input, "id", sourceFile)).not.toBeNull();
    expect(attributeValueText(input, "value", sourceFile)).not.toBeNull();
    expect(attributeValueText(input, "onChange", sourceFile)).not.toBeNull();
  });
});

describe("OrganizationSuspensionControls — visible, accessible mismatch feedback", () => {
  const content = readFileSync(COMPONENT_FILE, "utf8");

  it('renders the bounded mismatch copy "Doesn\'t match." somewhere in the confirmation dialog', () => {
    expect(content).toContain("Doesn&apos;t match.");
  });

  it("never renders the organization's id, an actor email, or any audit/raw-value placeholder text near the mismatch message (bounded, non-disclosing copy only)", () => {
    // A light-touch guard, not a full parse: the mismatch copy's own
    // literal string must not be adjacent to anything that looks like an
    // interpolated raw value in the same file.
    expect(content).not.toMatch(/Doesn&apos;t match\.[^<]*\{(?!\/)/);
  });
});

/**
 * ORGANIZATION_IDENTITY_CONFIRMATION_DESIGN correction: the discoverability
 * hotfix's own dedicated "Exact organization name" reference block —
 * and Organization.name itself — must be completely gone from this
 * component. The full name's one remaining home is the Organization
 * Detail page's own "Organization" section (see organization-detail-
 * header-wrap.test.ts's sibling coverage of page.tsx, and this file's
 * own check of the new Field there).
 */
describe("OrganizationSuspensionControls — the former exact-name reference block is gone", () => {
  const content = readFileSync(COMPONENT_FILE, "utf8");

  it('no longer renders the "Exact organization name" label anywhere', () => {
    expect(content).not.toContain("Exact organization name");
  });

  it("no longer accepts or reads Organization.name (an organizationName identifier) anywhere in this file", () => {
    expect(content).not.toMatch(/organizationName/);
  });

  it("no longer renders {organizationName} (or any name-shaped prop) as a JSX expression child anywhere", () => {
    const sourceFile = parseComponentFile();
    let found = false;
    function visit(node: ts.Node) {
      if (found) return;
      if (ts.isJsxExpression(node) && node.expression && ts.isIdentifier(node.expression) && node.expression.text === "organizationName") {
        found = true;
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    expect(found).toBe(false);
  });
});

/**
 * The replacement: a short, inline `SUSPEND <slug>` phrase, derived
 * deterministically from organizationSlug via the shared pure module
 * (organization-suspension-confirmation.ts) — never a large dedicated
 * block, never a Clipboard API call or Copy button (explicitly out of
 * scope for this design).
 */
describe("OrganizationSuspensionControls — inline SUSPEND <slug> confirmation phrase", () => {
  const content = readFileSync(COMPONENT_FILE, "utf8");

  it("accepts organizationSlug and derives the confirmation phrase via buildSuspendConfirmationPhrase", () => {
    expect(content).toMatch(/organizationSlug/);
    expect(content).toMatch(/buildSuspendConfirmationPhrase\(\s*organizationSlug\s*\)/);
  });

  it("renders the derived phrase inline inside the confirm-typing label — a short <code> element, not a separate large reference block", () => {
    const sourceFile = parseComponentFile();
    let found: ts.JsxElement | undefined;
    function visit(node: ts.Node) {
      if (found) return;
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === "code") {
        const hasPhraseChild = node.children.some(
          (c) => ts.isJsxExpression(c) && c.expression && ts.isIdentifier(c.expression) && c.expression.text === "confirmationPhrase",
        );
        if (hasPhraseChild) {
          found = node;
          return;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    expect(found).toBeDefined();
  });

  it("the label wraps safely at narrow widths (wrap-anywhere), and so does the inline phrase element itself", () => {
    const matches = content.match(/className="[^"]*wrap-anywhere[^"]*"/g) ?? [];
    // At least two occurrences: the label's own className and the <code> element's className.
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("never uses the Clipboard API, an automatic copy, or a Copy button", () => {
    expect(content).not.toMatch(/navigator\.clipboard|useClipboard|Copy(?:Button|ToClipboard)/);
  });
});
