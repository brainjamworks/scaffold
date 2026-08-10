import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import type { UnavailableCapabilityKind } from "@/document/model/establishment";
import {
  courseBlockAuthoringFrameAttributes,
  layoutAuthoringFrameAttributes,
  surfaceAuthoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";

import "./unavailable-content.css";

const KIND_LABELS = {
  block: "Block",
  layout: "Layout",
  surface: "Surface",
} as const satisfies Record<UnavailableCapabilityKind, string>;

export function UnavailableContentNodeView({ node, selected }: NodeViewProps) {
  const kind = unavailableKindFromNodeName(node.type.name);
  const capabilityId = readCapabilityId(node.attrs["capabilityId"]);

  return (
    <NodeViewWrapper
      className="sc-unavailable-content"
      {...unavailableAuthoringFrameAttributes(kind, node.attrs["id"], node.type.name)}
      data-selected={selected ? "true" : undefined}
      data-unavailable-content-kind={kind}
    >
      <span className="sc-unavailable-content__label">Unavailable {KIND_LABELS[kind]}</span>
      <span className="sc-unavailable-content__capability">{capabilityId}</span>
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

function readCapabilityId(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "Unavailable capability";
}
