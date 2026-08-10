import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Extension, Node, type Extensions } from "@tiptap/core";
import type { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ReactNodeViewRenderer } from "@tiptap/react";

import {
  ARRANGEMENT_CONTENT,
  CELL_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";

import {
  UnavailableContentNodeView,
  unavailableAuthoringFrameAttributes,
} from "./UnavailableContentNodeView";

export const UNAVAILABLE_CONTENT_NODE_NAMES = [
  "unavailable_block",
  "unavailable_layout",
  "unavailable_surface",
] as const;

export type UnavailableContentNodeName = (typeof UNAVAILABLE_CONTENT_NODE_NAMES)[number];

const UNAVAILABLE_CONTENT_NODE_NAME_SET = new Set<string>(UNAVAILABLE_CONTENT_NODE_NAMES);

export function createUnavailableContentAuthoringExtensions(): Extensions {
  return [
    createUnavailableContentNode("unavailable_block", "block"),
    createUnavailableContentNode(
      "unavailable_layout",
      `${ARRANGEMENT_CONTENT} ${CELL_ARRANGEMENT_CONTENT}`,
    ),
    createUnavailableContentNode("unavailable_surface"),
    createUnavailableContentClipboardPolicy(),
  ];
}

export function authoringCourseDocumentContentExpression(): string {
  const surface = "(surface | unavailable_surface)";
  return `${surface}+ | (courseSection ${surface}+)+`;
}

function createUnavailableContentNode(name: UnavailableContentNodeName, group?: string) {
  return Node.create({
    name,
    ...(group ? { group } : {}),
    content: "",
    atom: true,
    isolating: true,
    selectable: true,
    draggable: false,
    defining: true,

    addAttributes() {
      return {
        id: {
          default: null,
          isRequired: true,
          rendered: false,
          validate: assertStableId,
        },
        capabilityId: {
          default: null,
          isRequired: true,
          rendered: false,
          validate: assertCapabilityId,
        },
        original: {
          default: null,
          isRequired: true,
          rendered: false,
          validate: assertOriginalJson,
        },
      };
    },

    renderHTML({ node }) {
      const kind = name.slice("unavailable_".length) as "block" | "layout" | "surface";
      return [
        "div",
        {
          ...unavailableAuthoringFrameAttributes(kind, node.attrs["id"], name),
          "data-unavailable-content-kind": kind,
        },
      ];
    },

    addNodeView() {
      return ReactNodeViewRenderer(UnavailableContentNodeView);
    },
  });
}

function createUnavailableContentClipboardPolicy() {
  return Extension.create({
    name: "scaffoldUnavailableContentClipboardPolicy",
    priority: 10_001,

    addProseMirrorPlugins() {
      const refuseCompatibilityClipboard = (view: EditorView, event: Event) => {
        if (!containsUnavailableContent(view.state.selection.content())) return false;
        event.preventDefault();
        return true;
      };

      return [
        new Plugin({
          props: {
            handleDOMEvents: {
              copy: refuseCompatibilityClipboard,
              cut: refuseCompatibilityClipboard,
            },
            handlePaste: (_view, _event, slice) => containsUnavailableContent(slice),
          },
        }),
      ];
    },
  });
}

function containsUnavailableContent(slice: Slice): boolean {
  return fragmentContainsUnavailableContent(slice.content);
}

function fragmentContainsUnavailableContent(fragment: Fragment): boolean {
  for (let index = 0; index < fragment.childCount; index += 1) {
    const node = fragment.child(index);
    if (UNAVAILABLE_CONTENT_NODE_NAME_SET.has(node.type.name)) return true;
    if (fragmentContainsUnavailableContent(node.content)) return true;
  }
  return false;
}

function assertStableId(value: unknown): void {
  if (!EmbeddedNodeIdSchema.safeParse(value).success) {
    throw new RangeError("Unavailable content compatibility id must be a stable node ID.");
  }
}

function assertCapabilityId(value: unknown): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RangeError("Unavailable content capabilityId must be a non-blank string.");
  }
}

function assertOriginalJson(value: unknown): void {
  if (!isJsonObject(value) || typeof value["type"] !== "string" || !value["type"].trim()) {
    throw new RangeError("Unavailable content original must be a JSON node value.");
  }
  assertJsonValue(value);
}

function assertJsonValue(value: unknown): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item);
    return;
  }
  if (isJsonObject(value)) {
    for (const item of Object.values(value)) assertJsonValue(item);
    return;
  }
  throw new RangeError("Unavailable content original must contain JSON values only.");
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
