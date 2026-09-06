// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import type { Icon } from "@phosphor-icons/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { gridInsertAction } from "@/editor/arrangements/grid/model/grid-insert-action";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { createLayoutInsertAction } from "@/editor/arrangements/layout/model/layout-definition";
import { tabsLayoutDefinition } from "@/editor/arrangements/layout/tabs/tabs-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";

import type { InsertAction } from "./insert-action";
import { resolveInsertActionPlacement } from "./insertion-placement";

const editors: Editor[] = [];
const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();
const TestIcon = (() => null) as unknown as Icon;
const ordinaryInsertAction: InsertAction = Object.freeze({
  id: "test-paragraph",
  nodeType: "paragraph",
  title: "Paragraph",
  description: "Test paragraph",
  icon: TestIcon,
  category: "content",
  content: () => ({ type: "paragraph" }),
});
const cellFillInsertAction = createLayoutInsertAction(tabsLayoutDefinition);

type BoundedContainerType = "region" | "cell" | "section";

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("resolveInsertActionPlacement", () => {
  it.each(["region", "cell", "section"] as const)(
    "refuses an ordinary action after an existing fill occupant in a bounded %s",
    (containerType) => {
      const editor = makeEditor(activeContainerDocument(containerType, true));
      const range = rangeInsideParagraphOwnedBy(editor, containerType);

      expect(
        resolveInsertActionPlacement({
          blockDefinitions: builtInBlockRegistry,
          editor,
          item: ordinaryInsertAction,
          layoutDefinitions: builtInLayoutRegistry,
          range,
          surfaceVariants: builtInSurfaceVariantRegistry,
        }),
      ).toEqual({ ok: false });
    },
  );

  it.each(["region", "cell", "section"] as const)(
    "refuses a second fill occupant in an active bounded %s",
    (containerType) => {
      const editor = makeEditor(activeContainerDocument(containerType, true));
      const range = rangeInsideParagraphOwnedBy(editor, containerType);

      expect(
        resolveInsertActionPlacement({
          blockDefinitions: builtInBlockRegistry,
          editor,
          item: fillActionFor(containerType),
          layoutDefinitions: builtInLayoutRegistry,
          range,
          surfaceVariants: builtInSurfaceVariantRegistry,
        }),
      ).toEqual({ ok: false });
    },
  );

  it("rejects an authored-text fill action without materializing or mutating placement state", () => {
    const editor = makeEditor(activeContainerDocument("region", false, true));
    const range = rangeInsideTextParagraphOwnedBy(editor, "region");
    const beforeDocument = editor.state.doc.toJSON();
    const beforeSelection = editor.state.selection.toJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const content = vi.fn(() => ({ type: "grid" }));

    const result = resolveInsertActionPlacement({
      blockDefinitions: builtInBlockRegistry,
      editor,
      item: { ...gridInsertAction, content },
      layoutDefinitions: builtInLayoutRegistry,
      range,
      surfaceVariants: builtInSurfaceVariantRegistry,
    });

    expect(result).toEqual({ ok: false });
    expect(content).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.state.doc.toJSON()).toEqual(beforeDocument);
    expect(editor.state.selection.toJSON()).toEqual(beforeSelection);
  });

  it.each(["region", "cell", "section"] as const)(
    "replaces the sole empty paragraph for an otherwise empty bounded %s",
    (containerType) => {
      const editor = makeEditor(activeContainerDocument(containerType, false));
      const range = rangeInsideParagraphOwnedBy(editor, containerType);
      const paragraphRange = nodeRangeForParagraphOwnedBy(editor, containerType);

      expect(
        resolveInsertActionPlacement({
          blockDefinitions: builtInBlockRegistry,
          editor,
          item: fillActionFor(containerType),
          layoutDefinitions: builtInLayoutRegistry,
          range,
          surfaceVariants: builtInSurfaceVariantRegistry,
        }),
      ).toEqual({ ok: true, range: paragraphRange });
    },
  );

  it("keeps a bounded-layout registry defect observable", () => {
    const editor = makeEditor(activeRegionWithLayoutDocument());
    const range = rangeInsideParagraphOwnedBy(editor, "region");
    const defect = new Error("layout registry programming defect");
    const layoutDefinitions = {
      ...builtInLayoutRegistry,
      getForNode() {
        throw defect;
      },
    };
    let observed: unknown;

    try {
      resolveInsertActionPlacement({
        blockDefinitions: builtInBlockRegistry,
        editor,
        item: ordinaryInsertAction,
        layoutDefinitions,
        range,
        surfaceVariants: builtInSurfaceVariantRegistry,
      });
    } catch (error) {
      observed = error;
    }

    expect(observed).toBe(defect);
  });
});

function makeEditor(content: JSONContent): Editor {
  const editor = new Editor({
    extensions: createCourseDocumentAuthoringExtensions({
      composition: coreAuthoringComposition,
      editable: true,
    }),
    content,
  });
  editors.push(editor);
  return editor;
}

function fillActionFor(containerType: BoundedContainerType): InsertAction {
  return containerType === "cell" ? cellFillInsertAction : gridInsertAction;
}

function activeContainerDocument(
  containerType: BoundedContainerType,
  withFill: boolean,
  authoredText = false,
): JSONContent {
  const surface = slideContentSurfaceDefinition.createSurface({
    surfaceId: createEmbeddedNodeId(),
  });
  const region = surface.content?.find((node) => node.type === "region");
  if (!region) throw new Error("expected slide content surface region");
  region.attrs = {
    ...region.attrs,
    id: createEmbeddedNodeId(),
    role: "main",
  };

  if (containerType === "region") {
    region.content = withFill
      ? [grid(), paragraph(authoredText ? "Authored content" : "")]
      : [paragraph(authoredText ? "Authored content" : "")];
  } else if (containerType === "cell") {
    region.content = [
      {
        type: "grid",
        attrs: { id: createEmbeddedNodeId() },
        content: [
          {
            type: "cell",
            attrs: { id: createEmbeddedNodeId() },
            content: withFill
              ? [tabsLayout(), paragraph(authoredText ? "Authored content" : "")]
              : [paragraph(authoredText ? "Authored content" : "")],
          },
        ],
      },
    ];
  } else {
    region.content = [
      layoutWithSection(
        withFill
          ? [grid(), paragraph(authoredText ? "Authored content" : "")]
          : [paragraph(authoredText ? "Authored content" : "")],
      ),
    ];
  }

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page" },
        content: [surface],
      },
    ],
  };
}

function activeRegionWithLayoutDocument(): JSONContent {
  const document = activeContainerDocument("region", false);
  const region = document.content?.[0]?.content?.[0]?.content?.find(
    (node) => node.type === "region",
  );
  if (!region) throw new Error("expected slide content surface region");
  region.content = [tabsLayout(), paragraph()];
  return document;
}

function grid(): JSONContent {
  return {
    type: "grid",
    attrs: { id: createEmbeddedNodeId() },
    content: [
      {
        type: "cell",
        attrs: { id: createEmbeddedNodeId() },
        content: [{ type: "paragraph" }],
      },
    ],
  };
}

function tabsLayout(): JSONContent {
  return layoutWithSection([{ type: "paragraph" }]);
}

function layoutWithSection(sectionContent: JSONContent[]): JSONContent {
  return {
    type: "layout",
    attrs: { id: createEmbeddedNodeId(), variant: "tabs" },
    content: [
      {
        type: "section",
        attrs: { id: createEmbeddedNodeId(), role: "tab-panel" },
        content: sectionContent,
      },
    ],
  };
}

function paragraph(text = ""): JSONContent {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

function rangeInsideParagraphOwnedBy(editor: Editor, parentType: BoundedContainerType) {
  let range: { from: number; to: number } | undefined;
  editor.state.doc.descendants((node, pos, parent) => {
    if (
      parent?.type.name === parentType &&
      node.type.name === "paragraph" &&
      node.content.size === 0
    ) {
      range = { from: pos + 1, to: pos + 1 };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`expected an empty paragraph owned by ${parentType}`);
  return range;
}

function rangeInsideTextParagraphOwnedBy(editor: Editor, parentType: BoundedContainerType) {
  let range: { from: number; to: number } | undefined;
  editor.state.doc.descendants((node, pos, parent) => {
    if (parent?.type.name === parentType && node.type.name === "paragraph" && node.textContent) {
      range = { from: pos + 1, to: pos + 1 };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`expected authored text in a paragraph owned by ${parentType}`);
  return range;
}

function nodeRangeForParagraphOwnedBy(editor: Editor, parentType: BoundedContainerType) {
  let range: { from: number; to: number } | undefined;
  editor.state.doc.descendants((node, pos, parent) => {
    if (
      parent?.type.name === parentType &&
      node.type.name === "paragraph" &&
      node.content.size === 0
    ) {
      range = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`expected a paragraph owned by ${parentType}`);
  return range;
}
