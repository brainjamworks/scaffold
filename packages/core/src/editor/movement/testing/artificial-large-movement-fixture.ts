import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { courseBlockAuthoringFrameAttributes } from "@/editor/interactions/dom/authoring-frame";
import type { ClientPoint } from "@/editor/interactions/drag/model/coordinate-space";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";

import { resolveMovementNodeContext } from "../model/movement-policy";
import { discoverMovementTargetDescriptors } from "../view/movement-target-discovery";
import {
  measureMovementTargetEntries,
  type MovementTargetDescriptor,
  type MovementTargetIndexSnapshot,
  type MovementTargetQuerySource,
} from "../view/movement-target-index";
import {
  createMovementTargetIndexController,
  type MovementTargetIndexController,
} from "../view/movement-target-index-controller";
import type { MovementCandidate } from "../view/movement-candidate";

export const ARTIFICIAL_MOVEMENT_SLIDE_COUNT = 100;
export const ARTIFICIAL_MOVEMENT_BLOCK_COUNT = 2_000;
export const ARTIFICIAL_MOVEMENT_BLOCKS_PER_SLIDE =
  ARTIFICIAL_MOVEMENT_BLOCK_COUNT / ARTIFICIAL_MOVEMENT_SLIDE_COUNT;

const ARTIFICIAL_BLOCK_NODE = "artificial_large_movement_block";

const blockDefinitions = createBlockRegistry([defineBlock({ nodeType: ARTIFICIAL_BLOCK_NODE })]);

const ArtificialMovementBlockNode = Node.create({
  name: ARTIFICIAL_BLOCK_NODE,
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-artificial-movement-block]" }];
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        ...courseBlockAuthoringFrameAttributes({
          blockId: node.attrs["id"],
          nodeType: ARTIFICIAL_BLOCK_NODE,
        }),
        "data-artificial-movement-block": "",
      },
    ];
  },
});

const ArtificialMovementArrangementNode = Node.create({
  name: "artificial_large_movement_arrangement",
  group: "arrangement",
  content: "block*",
});

const ArtificialMovementRegionNode = Node.create({
  name: "artificial_large_movement_region",
  group: "region",
  content: "block*",
});

export interface ArtificialMovementOperationCounts {
  candidateQueries: number;
  nodeDOM: number;
  posAtCoords: number;
  rectReads: number;
  traversals: number;
}

export interface ArtificialLargeMovementFixture {
  readonly blockElements: readonly HTMLElement[];
  readonly candidateHistory: readonly (MovementCandidate | null)[];
  readonly controller: MovementTargetIndexController;
  readonly counts: ArtificialMovementOperationCounts;
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly initialPoint: ClientPoint;
  readonly scrollRoot: HTMLElement;
  readonly slideElements: readonly HTMLElement[];
  dispose(): void;
  entryForBlock(index: number): MovementTargetIndexSnapshot["entries"][number];
  pointForBlock(index: number): ClientPoint;
  startIndex(): number;
}

export function createArtificialLargeMovementFixture(): ArtificialLargeMovementFixture {
  const host = document.createElement("div");
  host.dataset.artificialLargeMovementFixture = "";
  host.style.cssText =
    "box-sizing: border-box; height: 640px; left: 0; position: absolute; top: 0; width: 800px";
  const styles = document.createElement("style");
  styles.textContent = `
    [data-artificial-large-movement-fixture] [data-surface] {
      box-sizing: border-box !important;
      display: block !important;
      height: 920px !important;
      margin: 0 0 32px !important;
      max-height: none !important;
      min-height: 920px !important;
      padding: 24px 32px !important;
      width: 100% !important;
    }

    [data-artificial-large-movement-fixture] [data-artificial-movement-block] {
      box-sizing: border-box !important;
      display: block !important;
      height: 36px !important;
      margin: 0 0 6px !important;
      width: 560px !important;
    }
  `;
  const scrollRoot = document.createElement("div");
  scrollRoot.style.cssText =
    "box-sizing: border-box; height: 560px; overflow: auto; position: relative; width: 720px";
  const editorElement = document.createElement("div");
  scrollRoot.append(editorElement);
  host.append(styles, scrollRoot);
  document.body.append(host);

  const editor = new Editor({
    editable: false,
    element: editorElement,
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      ArtificialMovementArrangementNode,
      ArtificialMovementRegionNode,
      ArtificialMovementBlockNode,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
    ],
    content: artificialMovementDocument(),
  });
  const blockElements = Object.freeze([
    ...editorElement.querySelectorAll<HTMLElement>("[data-artificial-movement-block]"),
  ]);
  const slideElements = Object.freeze([
    ...editorElement.querySelectorAll<HTMLElement>("[data-surface]"),
  ]);
  const sourcePos = findBlockPosition(editor, 0);
  const sourceContext = resolveMovementNodeContext(editor.state.doc, sourcePos);
  if (!sourceContext) throw new Error("Artificial movement source context is unavailable.");
  const source: MovementTargetQuerySource = { context: sourceContext, kind: "structure" };
  const counts: ArtificialMovementOperationCounts = {
    candidateQueries: 0,
    nodeDOM: 0,
    posAtCoords: 0,
    rectReads: 0,
    traversals: 0,
  };
  const candidateHistory: (MovementCandidate | null)[] = [];
  const traversalInstrumentation = createTraversalInstrumentation(counts);
  traversalInstrumentation.instrument(editor.state.doc);
  const rectangleInstrumentation = createRectangleReadInstrumentation(counts);
  const countingView = createCountingView(editor.view, counts, traversalInstrumentation);
  const controller = createMovementTargetIndexController({
    blockDefinitions,
    canApplyMovementResult: () => {
      counts.candidateQueries += 1;
      return true;
    },
    createMutationObserver: () => null,
    createResizeObserver: () => null,
    discoverDescriptors: (input) =>
      discoverMovementTargetDescriptors({ ...input, view: countingView }),
    isEnvironmentValid: () => host.isConnected && scrollRoot.isConnected,
    measureEntries: (descriptors) => {
      rectangleInstrumentation.instrument(descriptors);
      return measureMovementTargetEntries(descriptors);
    },
    onCandidateChange: (candidate) => candidateHistory.push(candidate),
    ownerDocument: host.ownerDocument,
    resolveSource: () => source,
    view: countingView,
  });
  const initialRect = blockElements[1]?.getBoundingClientRect();
  if (!initialRect) throw new Error("Artificial movement target DOM is unavailable.");
  const initialPoint = Object.freeze({
    space: "client" as const,
    x: initialRect.left + initialRect.width / 2,
    y: initialRect.top + initialRect.height / 2,
  });

  const snapshot = (): MovementTargetIndexSnapshot => {
    const current = controller.getSnapshot();
    if (!current) throw new Error("Artificial movement index has not been constructed.");
    return current;
  };
  const entryForBlock = (index: number) => {
    const id = artificialMovementBlockId(index);
    const entry = snapshot().entries.find(
      (candidate) => candidate.descriptor.context.node.attrs["id"] === id,
    );
    if (!entry) throw new Error(`Artificial movement entry ${id} is unavailable.`);
    return entry;
  };

  let disposed = false;
  return {
    blockElements,
    candidateHistory,
    controller,
    counts,
    editor,
    entryForBlock,
    host,
    initialPoint,
    pointForBlock(index) {
      const rect = entryForBlock(index).rect.measuredRect;
      return Object.freeze({
        space: "client",
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    },
    scrollRoot,
    slideElements,
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.dispose();
      rectangleInstrumentation.restore();
      traversalInstrumentation.restore();
      editor.destroy();
      host.remove();
    },
    startIndex() {
      const startedAt = performance.now();
      controller.start(initialPoint);
      controller.revalidate(initialPoint);
      return performance.now() - startedAt;
    },
  };
}

export function artificialMovementBlockId(index: number): string {
  return `large-block-${String(index).padStart(4, "0")}`;
}

function artificialMovementDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        content: Array.from({ length: ARTIFICIAL_MOVEMENT_SLIDE_COUNT }, (_, slideIndex) => ({
          type: "surface",
          attrs: {
            id: `surface${String(slideIndex + 1).padStart(5, "0")}`,
            variant: "page-default",
          },
          content: Array.from(
            { length: ARTIFICIAL_MOVEMENT_BLOCKS_PER_SLIDE },
            (_, blockIndex) => ({
              type: ARTIFICIAL_BLOCK_NODE,
              attrs: {
                id: artificialMovementBlockId(
                  slideIndex * ARTIFICIAL_MOVEMENT_BLOCKS_PER_SLIDE + blockIndex,
                ),
              },
            }),
          ),
        })),
      },
    ],
  };
}

function findBlockPosition(editor: Editor, index: number): number {
  const id = artificialMovementBlockId(index);
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== ARTIFICIAL_BLOCK_NODE || node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });
  if (found < 0) throw new Error(`Artificial movement block ${id} is unavailable.`);
  return found;
}

function createCountingView(
  view: EditorView,
  counts: ArtificialMovementOperationCounts,
  traversalInstrumentation: ReturnType<typeof createTraversalInstrumentation>,
): EditorView {
  return {
    get dom() {
      return view.dom;
    },
    get state() {
      const state = view.state;
      traversalInstrumentation.instrument(state.doc);
      return state;
    },
    nodeDOM(pos) {
      counts.nodeDOM += 1;
      return view.nodeDOM(pos);
    },
    posAtCoords(coords) {
      counts.posAtCoords += 1;
      return view.posAtCoords(coords);
    },
  } as EditorView;
}

function createTraversalInstrumentation(counts: ArtificialMovementOperationCounts) {
  const originals = new Map<ProseMirrorNode, PropertyDescriptor | undefined>();

  return {
    instrument(documentNode: ProseMirrorNode) {
      if (originals.has(documentNode)) return;
      const ownDescriptor = Object.getOwnPropertyDescriptor(documentNode, "descendants");
      const original = documentNode.descendants.bind(documentNode);
      originals.set(documentNode, ownDescriptor);
      Object.defineProperty(documentNode, "descendants", {
        configurable: true,
        value: (...args: Parameters<ProseMirrorNode["descendants"]>) => {
          counts.traversals += 1;
          return original(...args);
        },
      });
    },
    restore() {
      for (const [documentNode, ownDescriptor] of originals) {
        if (ownDescriptor) {
          Object.defineProperty(documentNode, "descendants", ownDescriptor);
        } else {
          Reflect.deleteProperty(documentNode, "descendants");
        }
      }
      originals.clear();
    },
  };
}

function createRectangleReadInstrumentation(counts: ArtificialMovementOperationCounts) {
  const originals = new Map<Element, PropertyDescriptor | undefined>();

  return {
    instrument(descriptors: readonly MovementTargetDescriptor[]) {
      for (const descriptor of descriptors) {
        const element = descriptor.element;
        if (originals.has(element)) continue;
        const ownDescriptor = Object.getOwnPropertyDescriptor(element, "getBoundingClientRect");
        const original = element.getBoundingClientRect.bind(element);
        originals.set(element, ownDescriptor);
        Object.defineProperty(element, "getBoundingClientRect", {
          configurable: true,
          value: () => {
            counts.rectReads += 1;
            return original();
          },
        });
      }
    },
    restore() {
      for (const [element, ownDescriptor] of originals) {
        if (ownDescriptor) {
          Object.defineProperty(element, "getBoundingClientRect", ownDescriptor);
        } else {
          Reflect.deleteProperty(element, "getBoundingClientRect");
        }
      }
      originals.clear();
    },
  };
}
