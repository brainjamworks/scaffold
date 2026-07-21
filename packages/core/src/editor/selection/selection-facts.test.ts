// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { AllSelection, NodeSelection, Selection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { resolveCourseSelectionFacts } from "./selection-facts";

class FallbackSelection extends Selection {
  constructor($pos: ResolvedPos) {
    super($pos, $pos);
  }

  eq(other: Selection): boolean {
    return other === this;
  }

  map(): Selection {
    return this;
  }

  toJSON(): Record<string, unknown> {
    return { type: "fallback" };
  }
}

function makeEditor() {
  return new Editor({
    extensions: [StarterKit.configure({ undoRedo: false })],
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Selection facts text" }],
        },
      ],
    },
  });
}

describe("resolveCourseSelectionFacts", () => {
  it("maps an empty TextSelection to textCaret", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection(3);

    expect(resolveCourseSelectionFacts(editor.state.selection)).toEqual({
      empty: true,
      range: { from: 3, to: 3 },
      selectionMode: "textCaret",
    });

    editor.destroy();
  });

  it("maps a non-empty TextSelection to textRange", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection({ from: 2, to: 6 });

    expect(resolveCourseSelectionFacts(editor.state.selection)).toEqual({
      empty: false,
      range: { from: 2, to: 6 },
      selectionMode: "textRange",
    });

    editor.destroy();
  });

  it("maps a NodeSelection to nodeSelection", () => {
    const editor = makeEditor();

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));

    const facts = resolveCourseSelectionFacts(editor.state.selection);

    expect(facts.selectionMode).toBe("nodeSelection");
    expect(facts.empty).toBe(false);
    expect(facts.range).toEqual({ from: 0, to: editor.state.selection.to });

    editor.destroy();
  });

  it("maps an AllSelection to allSelection", () => {
    const editor = makeEditor();

    editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));

    const facts = resolveCourseSelectionFacts(editor.state.selection);

    expect(facts.selectionMode).toBe("allSelection");
    expect(facts.empty).toBe(false);

    editor.destroy();
  });

  it("maps unknown selection classes to otherSelection", () => {
    const editor = makeEditor();

    const facts = resolveCourseSelectionFacts(new FallbackSelection(editor.state.doc.resolve(1)));

    expect(facts.selectionMode).toBe("otherSelection");
    expect(facts.empty).toBe(true);

    editor.destroy();
  });
});
