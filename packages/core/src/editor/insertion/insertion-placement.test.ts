// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import type { Icon } from "@phosphor-icons/react";
import { PresentationContentLayout } from "@scaffold/contracts";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { gridInsertAction } from "@/editor/arrangements/grid/model/grid-insert-action";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { createLayoutInsertAction } from "@/editor/arrangements/layout/model/layout-definition";
import { tabsLayoutDefinition } from "@/editor/arrangements/layout/tabs/tabs-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { CONTENT_LAYOUT_ATTR } from "@/editor/content-layout/model/content-layout-attribute";
import { readContentLayoutAuthoringState } from "@/editor/content-layout/prosemirror/content-layout-authoring-extension";
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
const FLOW = PresentationContentLayout.Flow;
const SEQUENCE = PresentationContentLayout.Sequence;

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("resolveInsertActionPlacement", () => {
  it.each(["region", "cell", "section"] as const)(
    "allows an ordinary action at the checked range after an existing fill occupant in a Sequence %s",
    (containerType) => {
      const editor = makeEditor(activeContainerDocument(containerType, SEQUENCE, true));
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
      ).toEqual({ ok: true, range });
    },
  );

  it.each(["region", "cell", "section"] as const)(
    "allows a fill action at the checked range after an existing fill occupant in a Sequence %s",
    (containerType) => {
      const editor = makeEditor(activeContainerDocument(containerType, SEQUENCE, true));
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
      ).toEqual({ ok: true, range });
    },
  );

  it.each(["region", "cell", "section"] as const)(
    "preserves Flow fill occupancy for an active bounded %s",
    (containerType) => {
      const editor = makeEditor(activeContainerDocument(containerType, FLOW, true));
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

  it("rejects an authored-text Flow fill action without materializing or mutating placement state", () => {
    const editor = makeEditor(activeContainerDocument("region", FLOW, false, true));
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
    "replaces the sole empty paragraph for an otherwise empty Flow %s",
    (containerType) => {
      const editor = makeEditor(activeContainerDocument(containerType, FLOW, false));
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

  it.each(["region", "cell", "section"] as const)(
    "keeps a checked slash range for a fill action in a Sequence %s",
    (containerType) => {
      const editor = makeEditor(activeContainerDocument(containerType, SEQUENCE, true));
      const range = rangeInsideParagraphOwnedBy(editor, containerType);

      expect(
        resolveInsertActionPlacement({
          blockDefinitions: builtInBlockRegistry,
          editor,
          intent: "slash-trigger-replacement",
          item: fillActionFor(containerType),
          layoutDefinitions: builtInLayoutRegistry,
          range,
          surfaceVariants: builtInSurfaceVariantRegistry,
        }),
      ).toEqual({ ok: true, range });
    },
  );

  it("does not materialize an action while resolving shared fill placement", () => {
    const editor = makeEditor(activeContainerDocument("region", SEQUENCE, true));
    const range = rangeInsideParagraphOwnedBy(editor, "region");
    const beforeDocument = editor.state.doc.toJSON();
    const beforeSelection = editor.state.selection.toJSON();
    const beforeActiveState = readContentLayoutAuthoringState(editor.state);
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

    expect(result).toEqual({ ok: true, range });
    expect(content).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.state.doc.toJSON()).toEqual(beforeDocument);
    expect(editor.state.selection.toJSON()).toEqual(beforeSelection);
    expect(readContentLayoutAuthoringState(editor.state)).toEqual(beforeActiveState);
  });

  it("throws when an active bounded container has an invalid established contentLayout", () => {
    const editor = makeEditor(activeContainerDocument("region", FLOW, false));
    const regionPosition = nodePosition(editor, "region");
    const region = editor.state.doc.nodeAt(regionPosition);
    if (!region) throw new Error("expected a Region");

    const invalidRegion = region.type.create(
      {
        ...region.attrs,
        [CONTENT_LAYOUT_ATTR]: "unsupported",
      },
      region.content,
      region.marks,
    );
    const invalidDoc = editor.state.tr.replaceWith(
      regionPosition,
      regionPosition + region.nodeSize,
      invalidRegion,
    ).doc;
    const range = rangeInsideParagraphOwnedBy(editor, "region");
    const invalidState = EditorState.create({
      doc: invalidDoc,
      schema: editor.schema,
      selection: TextSelection.create(invalidDoc, range.from, range.to),
    });
    const invalidEditor = { schema: editor.schema, state: invalidState } as Editor;

    expect(() =>
      resolveInsertActionPlacement({
        blockDefinitions: builtInBlockRegistry,
        editor: invalidEditor,
        item: gridInsertAction,
        layoutDefinitions: builtInLayoutRegistry,
        range,
        surfaceVariants: builtInSurfaceVariantRegistry,
      }),
    ).toThrow();
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
  contentLayout: typeof FLOW | typeof SEQUENCE,
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
    region.attrs = {
      ...region.attrs,
      [CONTENT_LAYOUT_ATTR]: contentLayout,
    };
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
            attrs: { id: createEmbeddedNodeId(), [CONTENT_LAYOUT_ATTR]: contentLayout },
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
        contentLayout,
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
  return layoutWithSection([{ type: "paragraph" }], FLOW);
}

function layoutWithSection(
  sectionContent: JSONContent[],
  contentLayout: typeof FLOW | typeof SEQUENCE,
): JSONContent {
  return {
    type: "layout",
    attrs: { id: createEmbeddedNodeId(), variant: "tabs" },
    content: [
      {
        type: "section",
        attrs: {
          id: createEmbeddedNodeId(),
          role: "tab-panel",
          [CONTENT_LAYOUT_ATTR]: contentLayout,
        },
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

function nodePosition(editor: Editor, nodeType: string): number {
  let position: number | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === nodeType) {
      position = pos;
      return false;
    }
    return true;
  });
  if (position === undefined) throw new Error(`expected a ${nodeType}`);
  return position;
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
