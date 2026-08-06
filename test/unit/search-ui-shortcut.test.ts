import { describe, expect, it } from "vitest";
import { isSearchShortcut, isEditableTarget, shouldHandleSearchShortcut } from "@/lib/search-ui/shortcut";

describe("isSearchShortcut", () => {
  it("recognizes Cmd+K (macOS)", () => {
    expect(isSearchShortcut({ key: "k", metaKey: true, ctrlKey: false })).toBe(true);
  });

  it("recognizes Ctrl+K (Windows/Linux)", () => {
    expect(isSearchShortcut({ key: "k", metaKey: false, ctrlKey: true })).toBe(true);
  });

  it("is case-insensitive on the key itself (Shift+K reports 'K')", () => {
    expect(isSearchShortcut({ key: "K", metaKey: true, ctrlKey: false })).toBe(true);
  });

  it("is not triggered by K alone, with neither modifier", () => {
    expect(isSearchShortcut({ key: "k", metaKey: false, ctrlKey: false })).toBe(false);
  });

  it("is not triggered by Cmd/Ctrl plus a different key", () => {
    expect(isSearchShortcut({ key: "p", metaKey: true, ctrlKey: false })).toBe(false);
    expect(isSearchShortcut({ key: "j", metaKey: false, ctrlKey: true })).toBe(false);
  });
});

describe("isEditableTarget", () => {
  it("true for an <input>", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
  });

  it("true for a <textarea>", () => {
    expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
  });

  it("true for a contenteditable element", () => {
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("false for a plain, non-editable element", () => {
    expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false);
  });

  it("false for null/undefined", () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});

describe("shouldHandleSearchShortcut", () => {
  it("ignores the shortcut when the dialog is closed and the target is an editable element elsewhere on the page (e.g. a Task title field)", () => {
    expect(shouldHandleSearchShortcut({ tagName: "INPUT" }, false)).toBe(false);
    expect(shouldHandleSearchShortcut({ tagName: "TEXTAREA" }, false)).toBe(false);
    expect(shouldHandleSearchShortcut({ tagName: "DIV", isContentEditable: true }, false)).toBe(false);
  });

  it("handles the shortcut when the dialog is closed and the target is not editable", () => {
    expect(shouldHandleSearchShortcut({ tagName: "BODY" }, false)).toBe(true);
    expect(shouldHandleSearchShortcut({ tagName: "BUTTON" }, false)).toBe(true);
  });

  it("always handles the shortcut while the dialog is already open — the exception for the search input itself, decided by dialog-open state rather than DOM node identity", () => {
    expect(shouldHandleSearchShortcut({ tagName: "INPUT" }, true)).toBe(true);
    expect(shouldHandleSearchShortcut({ tagName: "TEXTAREA" }, true)).toBe(true);
    expect(shouldHandleSearchShortcut(null, true)).toBe(true);
  });
});
