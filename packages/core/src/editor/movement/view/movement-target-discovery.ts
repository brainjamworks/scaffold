import type { EditorView } from "@tiptap/pm/view";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import {
  canTargetContainedMovement,
  canTargetStructureMovement,
  createStructureMovementPolicy,
  resolveMovementNodeContext,
} from "../model/movement-policy";
import { CONTAINED_MOVEMENT_TARGET_ATTR, resolveMovementAnchorElement } from "./movement-dom";
import type {
  MovementTargetDescriptor,
  MovementTargetKey,
  MovementTargetQuerySource,
} from "./movement-target-index";

export interface DiscoverMovementTargetDescriptorsInput {
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly documentRevision: number;
  readonly source: MovementTargetQuerySource;
  readonly view: EditorView;
}

export interface MovementTargetDiscoveryResult {
  readonly descriptors: readonly MovementTargetDescriptor[];
  readonly documentRevision: number;
}

export function discoverMovementTargetDescriptors({
  blockDefinitions,
  documentRevision,
  source,
  view,
}: DiscoverMovementTargetDescriptorsInput): MovementTargetDiscoveryResult {
  const descriptors: MovementTargetDescriptor[] = [];
  const policy =
    source.kind === "structure"
      ? createStructureMovementPolicy(view.state.schema, blockDefinitions)
      : null;

  view.state.doc.descendants((_node, pos) => {
    if (pos === source.context.pos) return false;

    const context = resolveMovementNodeContext(view.state.doc, pos);
    if (!context) return true;
    const eligible =
      source.kind === "structure"
        ? canTargetStructureMovement(policy!, context)
        : canTargetContainedMovement(source.context, context);
    if (!eligible) return true;

    const dom = view.nodeDOM(pos);
    if (!isElement(dom, view.dom.ownerDocument)) return true;
    const element =
      source.kind === "structure"
        ? resolveMovementAnchorElement(dom, context, blockDefinitions)
        : resolveContainedMovementAnchorElement(dom);
    if (!element) return true;

    descriptors.push(
      Object.freeze({
        context,
        documentPosition: pos,
        element,
        key: movementTargetKey(source.kind, context),
        kind: source.kind,
      }),
    );
    return true;
  });

  return Object.freeze({
    descriptors: Object.freeze(descriptors),
    documentRevision,
  });
}

function movementTargetKey(
  kind: MovementTargetQuerySource["kind"],
  context: MovementTargetDescriptor["context"],
): MovementTargetKey {
  const id = context.node.attrs["id"];
  const identity =
    typeof id === "string" && id.trim() ? id : `${context.parentPos ?? "root"}:${context.index}`;
  return `${kind}:${context.nodeType.name}:${context.pos}:${identity}`;
}

function resolveContainedMovementAnchorElement(dom: Element): Element | null {
  if (dom.matches(`[${CONTAINED_MOVEMENT_TARGET_ATTR}]`)) return dom;
  return dom.querySelector(`[${CONTAINED_MOVEMENT_TARGET_ATTR}]`);
}

function isElement(value: unknown, ownerDocument: Document): value is Element {
  const ElementConstructor = ownerDocument.defaultView?.Element;
  return Boolean(ElementConstructor && value instanceof ElementConstructor);
}
