import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Result } from "better-result";
import { useEffect, useRef } from "react";

import { tryGetControlBindingRegistryForEditor } from "@/document/control-binding";
import type {
  ControlBinding,
  ControlCommandResult,
  ControlEvent,
} from "@/document/control-binding";

import type {
  PdfEmbedRuntimeController,
  PdfPageNavigationOutcome,
} from "./pdf-embed-runtime-controller";

interface CreatePdfEmbedControlBindingInput {
  readonly controller: PdfEmbedRuntimeController;
  readonly ownerId: EmbeddedNodeId;
  readonly requireMounted: () => void;
}

export interface UsePdfEmbedControlBindingInput {
  readonly controller: PdfEmbedRuntimeController;
  readonly editor: Editor;
  readonly enabled: boolean;
  readonly getPos: () => number | undefined;
  readonly node: ProseMirrorNode;
  readonly ownerId: unknown;
}

/** Registers one runtime PDF owner after its first page has been presented. */
export function usePdfEmbedControlBinding(input: UsePdfEmbedControlBindingInput): void {
  const { controller, editor, enabled, ownerId } = input;
  const registry = tryGetControlBindingRegistryForEditor(editor);
  const behaviorRef = useRef(input);
  behaviorRef.current = input;

  useEffect(() => {
    if (!enabled || !registry || !controller.isReady()) return;
    const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(ownerId);
    if (!parsedOwnerId.success) return;
    const mountedOwnerId = parsedOwnerId.data;
    return registry.register(
      createPdfEmbedControlBinding({
        controller,
        ownerId: mountedOwnerId,
        requireMounted: () => requireCurrentPdfOwner(behaviorRef.current, mountedOwnerId),
      }),
    );
  }, [controller, editor, enabled, ownerId, registry]);
}

/** Adapts the render-confirmed PDF page authority without owning view state. */
export function createPdfEmbedControlBinding({
  controller,
  ownerId,
  requireMounted,
}: CreatePdfEmbedControlBindingInput): ControlBinding {
  const binding: ControlBinding = {
    ownerId,
    eventSource: {
      subscribe(listener) {
        requireMounted();
        return controller.subscribeToPresentations((presentation) => {
          if (
            presentation.origin !== "learner" ||
            presentation.previousPageNumber === presentation.pageNumber
          ) {
            return;
          }
          requireMounted();
          listener(
            Object.freeze({ targetId: ownerId, type: "page-changed" }) satisfies ControlEvent,
          );
        });
      },
    },
    stateReader: {
      read({ key }) {
        requireMounted();
        const pageNumber = controller.getPresentedPageNumber();
        const pageCount = controller.getPageCount();
        if (pageNumber === null || pageCount === null) {
          throw new Error("PDF Control Binding has no presented page authority.");
        }
        if (key === "page-number") return pageNumber;
        if (key === "last-page") return pageNumber === pageCount;
        throw new Error(`Unsupported PDF Control state "${key}".`);
      },
    },
    commandExecutor: {
      async execute({ input, signal, type }) {
        requireMounted();
        if (type !== "go-to-page") {
          throw new Error(`Unsupported PDF Control command "${type}".`);
        }
        if (typeof input !== "number") {
          throw new Error('PDF Control command "go-to-page" requires a numeric page.');
        }
        const outcome = await controller.navigateTo(input, "control-command", signal);
        if (outcome.kind === "pdf-unavailable") return commandResult(outcome);
        requireMounted();
        return commandResult(outcome);
      },
    },
  };
  return Object.freeze(binding);
}

function requireCurrentPdfOwner(
  behavior: UsePdfEmbedControlBindingInput,
  ownerId: EmbeddedNodeId,
): void {
  if (
    !behavior.controller.isReady() ||
    behavior.node.type.name !== "pdf_embed" ||
    behavior.node.attrs["id"] !== ownerId
  ) {
    throw new Error(`PDF Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`PDF Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`PDF Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  const current = behavior.editor.state.doc.nodeAt(position);
  if (current?.type.name !== "pdf_embed" || current.attrs["id"] !== ownerId) {
    throw new Error(`PDF Control Binding owner "${ownerId}" is no longer mounted.`);
  }
}

function commandResult(outcome: PdfPageNavigationOutcome): ControlCommandResult {
  switch (outcome.kind) {
    case "success":
      return Result.ok();
    case "cancelled":
      return Result.err(Object.freeze({ reason: "cancelled" }));
    case "page-out-of-range":
      return Result.err(
        Object.freeze({
          reason: "page-out-of-range",
          requestedPage: outcome.requestedPage,
          pageCount: outcome.pageCount,
        }),
      );
    case "pdf-unavailable":
      return Result.err(
        Object.freeze({
          reason: "pdf-unavailable",
          requestedPage: outcome.requestedPage,
        }),
      );
  }
}
