import { Extension, type Editor } from "@tiptap/core";
import type { Fragment, Node as ProseMirrorNode, ResolvedPos, Slice } from "@tiptap/pm/model";
import { Plugin, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import type { BlockRegistry } from "@/editor/blocks/block-registry";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { SurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { resolveSelectionOwnerBlock } from "@/editor/selection/block-context";
import { isNodeSelection, isTextSelection } from "@/editor/selection/selection-facts";
import { replaceRangeWithNodeChecked } from "@/document/model/commands/checked-transactions";
import { requireLayerMutationAccessForState } from "@/document/authoring/layers/layer-editing-boundaries";
import {
  cloneJsonWithNewStableIds,
  type ContentIdentityRewriteLookup,
} from "@/document/model/identity/clone-with-new-ids";
import { isUnavailableContentCompatibilityRootType } from "@/document/model/establishment/unavailable-content-compatibility-root";
import {
  encodeStructuralFragment,
  type StructuralFragmentContent,
  type StructuralFragmentRootKind,
  type StructuralFragmentV1Envelope,
} from "./structural-clipboard/structural-fragment-codec";
import {
  readStructuralFragmentClipboard,
  writeStructuralFragmentClipboard,
  type StructuralFragmentCarrierLimits,
} from "./structural-clipboard/structural-fragment-carrier";
import { resolveStructuralFragmentPlacement } from "./structural-clipboard/structural-fragment-placement";
import {
  validateStructuralFragment,
  type StructuralFragmentCapabilityRegistries,
} from "./structural-clipboard/structural-fragment-validation";

export interface StructuralClipboardPolicyOptions {
  readonly blockDefinitions: BlockRegistry;
  readonly identityRewrites: ContentIdentityRewriteLookup;
  readonly carrierLimits: StructuralFragmentCarrierLimits;
  readonly layoutDefinitions: LayoutRegistry;
  readonly surfaceVariants: SurfaceVariantRegistry;
}

export interface StructuralClipboardCopyRequest {
  readonly node: ProseMirrorNode;
  readonly readableText: string;
  readonly rootKind: StructuralFragmentRootKind;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    scaffoldStructuralClipboard: {
      copyStructuralRoot: (request: StructuralClipboardCopyRequest) => ReturnType;
    };
  }
}

export function createStructuralClipboardPolicy({
  blockDefinitions,
  identityRewrites,
  carrierLimits,
  layoutDefinitions,
  surfaceVariants,
}: StructuralClipboardPolicyOptions) {
  const capabilities: StructuralFragmentCapabilityRegistries = Object.freeze({
    blocks: blockDefinitions,
    layouts: layoutDefinitions,
    surfaces: surfaceVariants,
  });
  const isOwnedStructuralRoot = (node: ProseMirrorNode): boolean => {
    if (isUnavailableContentCompatibilityRootType(node.type.name)) return true;
    if (blockDefinitions.getByNodeType(node.type.name)) return true;

    const variant = node.attrs["variant"];
    if (typeof variant !== "string") return false;
    if (node.type.name === "layout") return layoutDefinitions.getById(variant) !== undefined;
    if (node.type.name === "surface") return surfaceVariants.get(variant) !== undefined;
    return false;
  };

  return Extension.create({
    name: "scaffoldStructuralClipboardPolicy",
    priority: 10_001,

    addCommands() {
      return {
        copyStructuralRoot:
          (request: StructuralClipboardCopyRequest) =>
          ({ editor, tr }) => {
            tr.setMeta("preventDispatch", true);
            const prepared = prepareStructuralClipboardCopy(
              request,
              editor.state.schema,
              capabilities,
            );
            return prepared
              ? copyPreparedStructuralRootDuringUserGesture(editor, prepared, carrierLimits)
              : false;
          },
      };
    },

    addProseMirrorPlugins() {
      const editor = this.editor;
      const capturedClipboardEvents = new WeakSet<Event>();
      const handledClipboardEvents = new WeakSet<Event>();

      const handleCopy = (view: EditorView, event: ClipboardEvent): boolean => {
        const root = resolveClipboardCopySource(view.state, blockDefinitions, layoutDefinitions);
        if (root.status === "absent") return false;

        event.preventDefault();
        if (root.status === "blocked") return true;
        const clipboardData = event.clipboardData;
        if (!clipboardData) return true;

        const prepared = prepareStructuralClipboardCopy(root, view.state.schema, capabilities);
        if (prepared) writePreparedStructuralClipboardEvent(event, prepared, carrierLimits);
        return true;
      };

      const handleCut = (view: EditorView, event: ClipboardEvent): boolean => {
        const activeRoot = resolveClipboardCopySource(
          view.state,
          blockDefinitions,
          layoutDefinitions,
        );
        if (
          activeRoot.status === "absent" &&
          !containsCompleteStructuralRoot(view.state.selection.content(), isOwnedStructuralRoot)
        ) {
          return false;
        }

        event.preventDefault();
        return true;
      };

      const handlePaste = (view: EditorView, event: ClipboardEvent): boolean => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const carrier = readStructuralFragmentClipboard(clipboardData, carrierLimits);
        if (carrier.status === "absent") return false;

        event.preventDefault();
        if (carrier.status === "invalid") return true;

        const validated = validateStructuralFragment({
          fragment: carrier.fragment,
          schema: view.state.schema,
          capabilities,
        });
        if (validated.status === "refused") return true;

        const destination =
          carrier.fragment.rootKind === "surface"
            ? resolveSurfacePasteDestination(view.state.selection.$from, view.state.selection.$to)
            : resolveStructuralPasteDestination(view.state, blockDefinitions, layoutDefinitions);
        if (!destination) return true;

        const layerAccess = requireLayerMutationAccessForState(view.state);
        const layerEditingContext =
          layerAccess.kind === "implicit-authoring" ? layerAccess.context : null;
        const placement = resolveStructuralFragmentPlacement({
          fragment: validated.value,
          doc: view.state.doc,
          destination,
          capabilities,
          ...(layerEditingContext ? { layerEditingContext } : {}),
        });
        if (placement.status === "refused") return true;

        const repairedJson = cloneJsonWithNewStableIds(validated.value.source, {
          identityRewrites,
        });
        const repaired = validateStructuralFragment({
          fragment: {
            ...carrier.fragment,
            content: repairedJson as StructuralFragmentContent,
          },
          schema: view.state.schema,
          capabilities,
        });
        if (repaired.status === "refused") return true;
        const repairedNode = repaired.value.node;

        if (placement.placement.kind === "surface") {
          editor.commands.applyCourseStructureCommand({
            type: "surface.insert",
            surface: repairedNode,
            destination: placement.placement.destination,
          });
          return true;
        }

        const mutation = replaceRangeWithNodeChecked({
          tr: view.state.tr,
          from: placement.placement.range.from,
          to: placement.placement.range.to,
          node: repairedNode,
          layerAccess,
        });
        if (!mutation.ok) return true;

        view.dispatch(
          mutation.tr.setMeta("paste", true).setMeta("uiEvent", "paste").scrollIntoView(),
        );
        return true;
      };

      const handleCapturedEvent = (
        view: EditorView,
        event: ClipboardEvent,
        handler: (view: EditorView, event: ClipboardEvent) => boolean,
      ): void => {
        capturedClipboardEvents.add(event);
        if (!isClipboardEventOwnedByEditor(view, event)) return;
        if (!handler(view, event)) return;

        handledClipboardEvents.add(event);
        // A recognized structural event is complete at this boundary. Prevent
        // ProseMirror's later DOM handler from serializing or inserting a
        // second ordinary clipboard representation after the checked mutation.
        event.stopImmediatePropagation();
      };

      const handleProseMirrorEvent = (
        view: EditorView,
        event: ClipboardEvent,
        handler: (view: EditorView, event: ClipboardEvent) => boolean,
      ): boolean =>
        capturedClipboardEvents.has(event)
          ? handledClipboardEvents.has(event)
          : handler(view, event);

      return [
        new Plugin({
          view(view) {
            const copy = (event: ClipboardEvent) => handleCapturedEvent(view, event, handleCopy);
            const cut = (event: ClipboardEvent) => handleCapturedEvent(view, event, handleCut);
            const paste = (event: ClipboardEvent) => handleCapturedEvent(view, event, handlePaste);

            view.dom.addEventListener("copy", copy, true);
            view.dom.addEventListener("cut", cut, true);
            view.dom.addEventListener("paste", paste, true);

            return {
              destroy() {
                view.dom.removeEventListener("copy", copy, true);
                view.dom.removeEventListener("cut", cut, true);
                view.dom.removeEventListener("paste", paste, true);
              },
            };
          },
          props: {
            handleDOMEvents: {
              copy: (view, event) => handleProseMirrorEvent(view, event, handleCopy),
              cut: (view, event) => handleProseMirrorEvent(view, event, handleCut),
              paste: (view, event) => handleProseMirrorEvent(view, event, handlePaste),
            },
            handlePaste: (_view, _event, slice) =>
              containsCompleteStructuralRoot(slice, isOwnedStructuralRoot),
          },
        }),
      ];
    },
  });
}

function isClipboardEventOwnedByEditor(view: EditorView, event: ClipboardEvent): boolean {
  const target = event.target;
  const element =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!element || !view.dom.contains(element)) return false;
  if (element.closest("input, textarea, select")) return false;

  const editableHost = element.closest('[contenteditable]:not([contenteditable="false"])');
  return editableHost === view.dom;
}

type ActiveStructuralClipboardRoot =
  | {
      readonly node: ProseMirrorNode;
      readonly status: "resolved";
    }
  | { readonly status: "blocked" }
  | { readonly status: "absent" };

type ClipboardCopySource =
  | {
      readonly node: ProseMirrorNode;
      readonly readableText: string;
      readonly rootKind: StructuralFragmentRootKind;
      readonly status: "copy";
    }
  | { readonly status: "blocked" }
  | { readonly status: "absent" };

function resolveClipboardCopySource(
  state: EditorState,
  blockDefinitions: BlockRegistry,
  layoutDefinitions: LayoutRegistry,
): ClipboardCopySource {
  if (isNodeSelection(state.selection)) {
    const root = resolveCopyRoot(state.selection.node, blockDefinitions, layoutDefinitions);
    return root.status === "copy" ? { ...root, node: state.selection.node } : root;
  }

  if (!isTextSelection(state.selection) || !state.selection.empty) {
    return { status: "absent" };
  }

  const selectionOwner = resolveSelectionOwnerBlock(state.selection, blockDefinitions);
  if (selectionOwner) {
    const root = resolveCopyRoot(selectionOwner.node, blockDefinitions, layoutDefinitions);
    return root.status === "copy" ? { ...root, node: selectionOwner.node } : { status: "blocked" };
  }

  const activeRoot = resolveMountedStructuralClipboardRoot(
    state.selection.$from,
    blockDefinitions,
    layoutDefinitions,
  );
  if (activeRoot.status !== "resolved") return activeRoot;

  const root = resolveCopyRoot(activeRoot.node, blockDefinitions, layoutDefinitions);
  // A visible Block/Layout owner that no longer resolves to its exact mounted
  // capability is recognized but blocked, so ordinary clipboard serialization
  // cannot leak a stale complete component.
  return root.status === "copy" ? { ...root, node: activeRoot.node } : { status: "blocked" };
}

function resolveStructuralPasteDestination(
  state: EditorState,
  blockDefinitions: BlockRegistry,
  layoutDefinitions: LayoutRegistry,
) {
  if (isNodeSelection(state.selection)) {
    return { kind: "selection" as const, selection: state.selection };
  }

  if (!isTextSelection(state.selection) || !state.selection.empty) return null;

  const activeRoot = resolveMountedStructuralClipboardRoot(
    state.selection.$from,
    blockDefinitions,
    layoutDefinitions,
  );
  if (activeRoot.status === "blocked") return null;
  return { kind: "text-caret" as const, selection: state.selection };
}

function resolveMountedStructuralClipboardRoot(
  $pos: ResolvedPos,
  blockDefinitions: BlockRegistry,
  layoutDefinitions: LayoutRegistry,
): ActiveStructuralClipboardRoot {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (isUnavailableContentCompatibilityRootType(node.type.name)) return { status: "blocked" };
    if (blockDefinitions.getByNodeType(node.type.name)) {
      return { node, status: "resolved" };
    }
    if (node.type.name === "layout") {
      return layoutDefinitions.getForNode(node)
        ? { node, status: "resolved" }
        : { status: "blocked" };
    }
    if (node.type.name === "surface") break;
  }

  return { status: "absent" };
}

function resolveSurfacePasteDestination($from: ResolvedPos, $to: ResolvedPos) {
  const fromSurfaceId = findAncestorSurfaceId($from);
  const toSurfaceId = findAncestorSurfaceId($to);
  return fromSurfaceId && fromSurfaceId === toSurfaceId
    ? { kind: "surface" as const, afterSurfaceId: fromSurfaceId }
    : null;
}

function findAncestorSurfaceId($pos: ResolvedPos): string | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "surface") continue;
    const id = node.attrs["id"];
    return typeof id === "string" ? id : null;
  }
  return null;
}

function resolveCopyRoot(
  node: ProseMirrorNode,
  blockDefinitions: BlockRegistry,
  layoutDefinitions: LayoutRegistry,
):
  | {
      readonly status: "copy";
      readonly rootKind: StructuralFragmentRootKind;
      readonly readableText: string;
    }
  | { readonly status: "blocked" }
  | { readonly status: "absent" } {
  if (isUnavailableContentCompatibilityRootType(node.type.name) || node.type.name === "surface") {
    return { status: "blocked" };
  }

  const block = blockDefinitions.getByNodeType(node.type.name);
  if (block) {
    return { status: "copy", rootKind: "block", readableText: `Block: ${block.title}` };
  }

  const layout = layoutDefinitions.getForNode(node);
  if (!layout) return { status: "absent" };
  return { status: "copy", rootKind: "layout", readableText: `Layout: ${layout.title}` };
}

interface PreparedStructuralClipboardCopy {
  readonly encodedFragment: string;
  readonly readableText: string;
}

function prepareStructuralClipboardCopy(
  request: StructuralClipboardCopyRequest,
  schema: EditorState["schema"],
  capabilities: StructuralFragmentCapabilityRegistries,
): PreparedStructuralClipboardCopy | null {
  try {
    const encodedFragment = encodeStructuralFragment({
      rootKind: request.rootKind,
      content: request.node.toJSON() as StructuralFragmentContent,
    });
    const validation = validateStructuralFragment({
      fragment: JSON.parse(encodedFragment) as StructuralFragmentV1Envelope,
      schema,
      capabilities,
    });
    return validation.status === "ok"
      ? Object.freeze({ encodedFragment, readableText: request.readableText })
      : null;
  } catch {
    return null;
  }
}

function writePreparedStructuralClipboardEvent(
  event: ClipboardEvent,
  prepared: PreparedStructuralClipboardCopy,
  carrierLimits: StructuralFragmentCarrierLimits,
): boolean {
  event.preventDefault();
  const clipboardData = event.clipboardData;
  if (!clipboardData) return false;

  try {
    return writeStructuralFragmentClipboard(clipboardData, prepared, carrierLimits).status === "ok";
  } catch {
    // The event remains consumed so a complete structural root cannot leak
    // into ordinary clipboard serialization after a mandatory carrier fails.
    return false;
  }
}

function copyPreparedStructuralRootDuringUserGesture(
  editor: Editor,
  prepared: PreparedStructuralClipboardCopy,
  carrierLimits: StructuralFragmentCarrierLimits,
): boolean {
  const ownerDocument = editor.view.dom.ownerDocument;
  let copied = false;
  const handleCopy = (event: Event) => {
    copied = writePreparedStructuralClipboardEvent(
      event as ClipboardEvent,
      prepared,
      carrierLimits,
    );
    event.stopImmediatePropagation();
  };

  ownerDocument.addEventListener("copy", handleCopy, { capture: true, once: true });
  try {
    editor.view.focus();
    ownerDocument.execCommand("copy");
  } catch {
    return false;
  } finally {
    ownerDocument.removeEventListener("copy", handleCopy, true);
  }
  return copied;
}

function containsCompleteStructuralRoot(
  slice: Slice,
  isOwnedStructuralRoot: (node: ProseMirrorNode) => boolean,
): boolean {
  return fragmentContainsCompleteStructuralRoot(
    slice.content,
    slice.openStart,
    slice.openEnd,
    isOwnedStructuralRoot,
  );
}

function fragmentContainsCompleteStructuralRoot(
  fragment: Fragment,
  openStart: number,
  openEnd: number,
  isOwnedStructuralRoot: (node: ProseMirrorNode) => boolean,
): boolean {
  let found = false;
  const lastIndex = fragment.childCount - 1;

  fragment.forEach((node, _offset, index) => {
    if (found) return;

    const nodeOpenStart = index === 0 ? openStart : 0;
    const nodeOpenEnd = index === lastIndex ? openEnd : 0;
    if (nodeOpenStart === 0 && nodeOpenEnd === 0 && isOwnedStructuralRoot(node)) {
      found = true;
      return;
    }

    if (node.childCount === 0) return;
    found = fragmentContainsCompleteStructuralRoot(
      node.content,
      Math.max(0, nodeOpenStart - 1),
      Math.max(0, nodeOpenEnd - 1),
      isOwnedStructuralRoot,
    );
  });

  return found;
}
