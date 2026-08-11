import { TrashIcon as Trash } from "@phosphor-icons/react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import type { MouseEvent as ReactMouseEvent } from "react";

import type { UnavailableCapabilityKind } from "@/document/model/establishment";
import {
  courseBlockAuthoringFrameAttributes,
  layoutAuthoringFrameAttributes,
  surfaceAuthoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import { Button } from "@/ui/components/Button/Button";

import "./unavailable-content.css";

const KIND_PRESENTATION = {
  block: {
    description: "This block isn’t available in this application. You can keep it or delete it.",
    deleteLabel: "Delete unavailable block",
    unavailableLabel: "Unavailable block",
  },
  layout: {
    description: "This layout isn’t available in this application. You can keep it or delete it.",
    deleteLabel: "Delete unavailable layout",
    unavailableLabel: "Unavailable layout",
  },
  surface: {
    description: "This surface isn’t available in this application. You can keep it or delete it.",
    deleteLabel: "Delete unavailable surface",
    unavailableLabel: "Unavailable surface",
  },
} as const satisfies Record<
  UnavailableCapabilityKind,
  { description: string; deleteLabel: string; unavailableLabel: string }
>;

export function UnavailableContentNodeView({
  deleteNode,
  editor,
  getPos,
  node,
  selected,
}: NodeViewProps) {
  const kind = unavailableKindFromNodeName(node.type.name);
  const capabilityLabel = readCapabilityLabel(node.attrs["capabilityId"]);
  const presentation = KIND_PRESENTATION[kind];

  const selectUnavailableItem = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !editor.isEditable) return;
    const position = getPos();
    if (typeof position !== "number") return;

    event.preventDefault();
    event.stopPropagation();
    editor.commands.setNodeSelection(position);
  };

  const deleteUnavailableItem = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deleteNode();
    editor.commands.focus();
  };

  return (
    <NodeViewWrapper
      {...unavailableAuthoringFrameAttributes(kind, node.attrs["id"], node.type.name)}
      aria-label={`${presentation.unavailableLabel}: ${capabilityLabel}`}
      className="sc-app-unavailable-content"
      data-selected={selected ? "true" : undefined}
      data-unavailable-content-kind={kind}
      role="group"
      onMouseDownCapture={selectUnavailableItem}
    >
      <div className="sc-app-unavailable-content__surface">
        <span className="sc-app-unavailable-content__copy">
          <span className="sc-app-unavailable-content__title">{capabilityLabel}</span>
          <span className="sc-app-unavailable-content__description">
            {presentation.description}
          </span>
        </span>
        <Button
          aria-label={`${presentation.deleteLabel}: ${capabilityLabel}`}
          className="sc-app-unavailable-content__delete"
          disabled={!editor.isEditable}
          size="lg"
          variant="secondary"
          onClick={deleteUnavailableItem}
        >
          <Trash aria-hidden size={16} weight="bold" />
          Delete
        </Button>
      </div>
    </NodeViewWrapper>
  );
}

export function unavailableAuthoringFrameAttributes(
  kind: UnavailableCapabilityKind,
  id: unknown,
  nodeType: string,
): Record<string, string> {
  switch (kind) {
    case "block":
      return courseBlockAuthoringFrameAttributes({ blockId: id, nodeType });
    case "layout":
      return layoutAuthoringFrameAttributes({ layoutId: id });
    case "surface":
      return surfaceAuthoringFrameAttributes({ surfaceId: id });
  }
}

function unavailableKindFromNodeName(nodeName: string): UnavailableCapabilityKind {
  if (nodeName === "unavailable_block") return "block";
  if (nodeName === "unavailable_layout") return "layout";
  if (nodeName === "unavailable_surface") return "surface";
  throw new Error("Unavailable content NodeView received an unsupported node type.");
}

function readCapabilityLabel(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) return "Unavailable content";

  const words = value
    .trim()
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!words) return "Unavailable content";
  return `${words.charAt(0).toLocaleUpperCase()}${words.slice(1)}`;
}
