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
 * hotfix's own dedicated "Exact organization name" reference block is
 * gone — that specific large, retype-it-back reference panel is retired
 * for good.
 *
 * organization-selection hardening: organizationName is now
 * *reintroduced*, but strictly as a display-only identity summary (see
 * the sibling describe block below). This block proves the negative
 * space around that reintroduction: the old confirmation-by-retyping
 * label/copy never comes back, and — most importantly — organizationName
 * is never passed into any of the pure confirmation-logic functions, no
 * matter how it's used elsewhere in this file for display.
 */
describe("OrganizationSuspensionControls — the former exact-name reference block is gone, and Organization.name can never re-enter the confirmation logic", () => {
  const content = readFileSync(COMPONENT_FILE, "utf8");
  const sourceFile = parseComponentFile();

  it('no longer renders the retired "Exact organization name" confirmation label', () => {
    expect(content).not.toContain("Exact organization name");
  });

  it("no longer renders the retired \"Type the name above to confirm\" label", () => {
    expect(content).not.toContain("Type the name above to confirm");
  });

  it("organizationName is never passed as an argument to buildSuspendConfirmationPhrase, canConfirmSuspend, suspendConfirmationMatches, or showsPhraseMismatch", () => {
    const confirmationFunctionNames = new Set([
      "buildSuspendConfirmationPhrase",
      "canConfirmSuspend",
      "suspendConfirmationMatches",
      "showsPhraseMismatch",
    ]);
    const violations: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && confirmationFunctionNames.has(node.expression.text)) {
        for (const arg of node.arguments) {
          if (ts.isIdentifier(arg) && arg.text === "organizationName") {
            violations.push(node.expression.text);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    expect(violations).toEqual([]);
  });

  it("this module's own confirmation-phrase import is unaffected — still imports exactly the slug-based contract, nothing name-shaped", () => {
    expect(content).toMatch(/import\s*\{\s*buildSuspendConfirmationPhrase,\s*canConfirmSuspend,\s*showsPhraseMismatch\s*\}\s*from\s*"@\/lib\/platform-admin\/organization-suspension-confirmation"/);
  });
});

/**
 * organization-selection hardening: a compact, display-only identity
 * summary (organization name + slug) now appears inside both dialogs —
 * the modal's own backdrop otherwise leaves an operator with no
 * accessible cross-check for which organization they selected once
 * focus is trapped inside it, a real risk for duplicate/generic
 * "<name>'s Workspace" organizations. This is pure presentation: it is
 * never referenced by canConfirm/phraseMismatches (proved by the
 * describe block above), and the typed-confirmation contract remains
 * exclusively `SUSPEND <slug>`.
 */
describe("OrganizationSuspensionControls — organization identity summary (display-only, name + slug)", () => {
  const content = readFileSync(COMPONENT_FILE, "utf8");
  const sourceFile = parseComponentFile();

  function findFunctionDeclaration(name: string): ts.FunctionDeclaration {
    let found: ts.FunctionDeclaration | undefined;
    function visit(node: ts.Node) {
      if (found) return;
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
        found = node;
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    if (!found) throw new Error(`No function declaration named ${name} found.`);
    return found;
  }

  function findJsxElementsByTag(root: ts.Node, tagName: string): (ts.JsxElement | ts.JsxSelfClosingElement)[] {
    const results: (ts.JsxElement | ts.JsxSelfClosingElement)[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === tagName) results.push(node);
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === tagName) results.push(node);
      ts.forEachChild(node, visit);
    }
    visit(root);
    return results;
  }

  it("a shared OrganizationIdentitySummary component exists, accepting organizationName and organizationSlug", () => {
    const fn = findFunctionDeclaration("OrganizationIdentitySummary");
    const params = fn.parameters[0];
    expect(params).toBeDefined();
    const paramText = params.getText(sourceFile);
    expect(paramText).toContain("organizationName");
    expect(paramText).toContain("organizationSlug");
  });

  it("OrganizationIdentitySummary renders both organizationName and organizationSlug, each wrap-anywhere for narrow-width safety", () => {
    const fn = findFunctionDeclaration("OrganizationIdentitySummary");
    const spans = findJsxElementsByTag(fn, "span");
    expect(spans.length).toBeGreaterThanOrEqual(2);
    for (const span of spans) {
      const className = span.getText(sourceFile);
      expect(className).toMatch(/\bwrap-anywhere\b/);
    }
    const fnText = fn.getText(sourceFile);
    expect(fnText).toContain("{organizationName}");
    expect(fnText).toContain("{organizationSlug}");
  });

  it("OrganizationIdentitySummary never renders an id, email, or audit-shaped value", () => {
    // AST identifier matching, not a text/regex substring scan — a naive
    // substring check for "organizationId" would false-positive on this
    // component's own name, OrganizationIdentitySummary.
    const fn = findFunctionDeclaration("OrganizationIdentitySummary");
    const forbiddenIdentifiers = new Set(["organizationId", "actorEmail", "email", "reasonCode"]);
    let violation: string | null = null;
    function visit(node: ts.Node) {
      if (violation) return;
      if (ts.isJsxExpression(node) && node.expression && ts.isIdentifier(node.expression) && forbiddenIdentifiers.has(node.expression.text)) {
        violation = node.expression.text;
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(fn);
    expect(violation).toBeNull();
  });

  function findJsxAttributeValueText(element: ts.JsxElement | ts.JsxSelfClosingElement, attrName: string): string | null {
    const openingElement = ts.isJsxSelfClosingElement(element) ? element : element.openingElement;
    for (const prop of openingElement.attributes.properties) {
      if (!ts.isJsxAttribute(prop) || prop.name.getText() !== attrName) continue;
      const init = prop.initializer;
      if (init && ts.isJsxExpression(init) && init.expression) return init.expression.getText(sourceFile);
      return null;
    }
    return null;
  }

  it("the Suspend dialog includes the identity summary, and its id is added to the dialog's own aria-describedby", () => {
    expect(content).toMatch(/You are about to suspend <OrganizationIdentitySummary/);
    const dialogs = findJsxElementsByTag(sourceFile, "dialog");
    const suspendDialog = dialogs.find((d) => d.getText(sourceFile).includes("Suspend organization"));
    expect(suspendDialog).toBeDefined();
    // AST attribute lookup, not a brace-counting regex on raw text — the
    // real value is a template literal (`${descriptionId} ${identitySummaryId}`),
    // whose own nested braces a naive `\{([^}]*)\}` regex cannot parse
    // correctly.
    const describedBy = findJsxAttributeValueText(suspendDialog!, "aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(describedBy).toContain("identitySummaryId");
    expect(describedBy).toContain("descriptionId");
  });

  it("the Reactivate dialog's ConfirmDialog description includes the same identity summary component", () => {
    const reactivateFn = findFunctionDeclaration("ReactivateControl");
    const confirmDialogs = findJsxElementsByTag(reactivateFn, "ConfirmDialog");
    expect(confirmDialogs).toHaveLength(1);
    expect(confirmDialogs[0].getText(sourceFile)).toContain("OrganizationIdentitySummary");
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
