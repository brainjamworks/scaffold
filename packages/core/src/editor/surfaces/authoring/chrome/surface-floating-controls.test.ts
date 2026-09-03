// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createInteractionOwnerCommandPorts } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-command-ports";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";

import { regionMenuFloatingControl, surfaceMenuFloatingControl } from "./surface-floating-controls";

describe("surface floating controls", () => {
  it("places top-right owner controls outside their frame with a visible gap", () => {
    expect(surfaceMenuFloatingControl.inlineOffset).toBe(4);
    expect(regionMenuFloatingControl.inlineOffset).toBe(4);
  });

  it("resolves Surface options from editable slide-title context without opening its menu", () => {
    const { editor, surfaceId } = createSurfaceContextEditor();

    try {
      editor.commands.setTextSelection(textPosition(editor, "Editable slide title"));

      expect(surfaceMenuFloatingControl.resolveState(editor)?.target).toMatchObject({
        id: surfaceId,
        kind: InteractionTargetKind.Surface,
      });
      expect(ownerSnapshot(editor).owners.menuOwner.target).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("resolves Surface options from editable Page content without opening its menu", () => {
    const { editor, surfaceId } = createPageSurfaceContextEditor();

    try {
      editor.commands.setTextSelection(textPosition(editor, "Editable Page body"));

      expect(surfaceMenuFloatingControl.resolveState(editor)?.target).toMatchObject({
        id: surfaceId,
        kind: InteractionTargetKind.Surface,
      });
      expect(ownerSnapshot(editor).owners.menuOwner.target).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("keeps Surface options available alongside Block chrome for editable Block content", () => {
    const { blockId, editor, surfaceId } = createSurfaceContextEditor();

    try {
      editor.commands.setTextSelection(textPosition(editor, "Editable Block body"));

      expect(surfaceMenuFloatingControl.resolveState(editor)?.target).toMatchObject({
        id: surfaceId,
        kind: InteractionTargetKind.Surface,
      });
      expect(ownerSnapshot(editor).chromeSlots.blockBubble).toMatchObject({
        target: { id: blockId, kind: InteractionTargetKind.Block },
        visible: true,
      });
    } finally {
      editor.destroy();
    }
  });

  it("opens the Surface menu without disturbing an editable Block selection", () => {
    const { blockId, editor, surfaceId } = createSurfaceContextEditor();

    try {
      editor.commands.setTextSelection(textPosition(editor, "Editable Block body"));
      const selectionBefore = editor.state.selection;
      const target = surfaceMenuFloatingControl.resolveState(editor)?.target;
      if (!target) throw new Error("Expected Surface options for the active Block context.");

      expect(
        createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry).toggleMenu(target),
      ).toBe(true);

      const snapshot = ownerSnapshot(editor);
      expect(snapshot.owners.menuOwner.target).toMatchObject({
        id: surfaceId,
        kind: InteractionTargetKind.Surface,
      });
      expect(snapshot.chromeSlots.blockBubble).toMatchObject({
        target: { id: blockId, kind: InteractionTargetKind.Block },
        visible: true,
      });
      expect(editor.state.selection.eq(selectionBefore)).toBe(true);
    } finally {
      editor.destroy();
    }
  });
});

const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();

function createSurfaceContextEditor(): {
  blockId: string;
  editor: Editor;
  surfaceId: string;
} {
  const surfaceId = createEmbeddedNodeId();
  const blockId = createEmbeddedNodeId();
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const title = surface.content?.find((node) => node.type === "slide_title");
  const region = surface.content?.find((node) => node.type === "region");
  if (!title || !region) throw new Error("Expected the slide-content structure.");

  title.content = [{ type: "text", text: "Editable slide title" }];
  region.content = [
    {
      type: "callout",
      attrs: { id: blockId },
      content: [
        {
          type: "callout_title",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Editable Block title" }],
            },
          ],
        },
        {
          type: "callout_prompt",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Editable Block body" }],
            },
          ],
        },
      ],
    },
  ];

  const content = addMissingNodeIds({
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          mode: "slideshow",
          overflowMode: "clip",
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          surfaceSize: "16x9",
        },
        content: [{ type: "courseSection", attrs: { title: "Introduction" } }, surface],
      },
    ],
  });
  const editor = new Editor({
    editable: true,
    extensions: createCourseDocumentAuthoringExtensions({
      composition: coreAuthoringComposition,
      editable: true,
    }),
    content,
  });

  return { blockId, editor, surfaceId };
}

function createPageSurfaceContextEditor(): {
  editor: Editor;
  surfaceId: string;
} {
  const surfaceId = createEmbeddedNodeId();
  const surface: JSONContent = pageDefaultSurfaceDefinition.createSurface({ surfaceId });
  surface.content = [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Editable Page body" }],
    },
  ];

  const content = addMissingNodeIds({
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          mode: "page",
          overflowMode: "grow",
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          surfaceSize: "fluid",
        },
        content: [surface],
      },
    ],
  });
  const editor = new Editor({
    editable: true,
    extensions: createCourseDocumentAuthoringExtensions({
      composition: coreAuthoringComposition,
      editable: true,
    }),
    content,
  });

  return { editor, surfaceId };
}

function addMissingNodeIds(node: JSONContent): JSONContent {
  if (node.type === "text") return node;

  return {
    ...node,
    attrs: { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() },
    ...(node.content ? { content: node.content.map(addMissingNodeIds) } : {}),
  };
}

function textPosition(editor: Editor, text: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null || !node.isTextblock || !node.textContent.includes(text)) return true;
    found = pos + 1;
    return false;
  });
  if (found === null) throw new Error(`Expected text "${text}".`);
  return found;
}

function ownerSnapshot(editor: Editor) {
  return publishInteractionOwnerSnapshot(editor.state, null, {
    blockDefinitions: builtInBlockRegistry,
  });
}
