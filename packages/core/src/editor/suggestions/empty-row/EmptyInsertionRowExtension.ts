import { Extension, isNodeEmpty, type Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey, Selection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { STRUCTURAL_INSERTION_PARENT_TYPES } from "@/editor/prosemirror/placeholder/structural-insertion-parent-types";
import { allowsBoundedContainerRootInsertionAtPosition } from "@/editor/bounded-containers/model/bounded-container-structure-policy";
import { allowsSurfaceRootInsertion } from "@/editor/surfaces/model/policies/surface-root-insertion-policy";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";

const EMPTY_INSERTION_ROW_PLUGIN_KEY = new PluginKey("sc-empty-insertion-row");
const EMPTY_INSERTION_ROW_PROMPT = "Start typing or add a block";
const EMPTY_INSERTION_ROW_PROMPT_ID = "sc-empty-insertion-row-prompt";
const MIN_SCALE = 0.56;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

type EmptyInsertionRowElement = HTMLElement & {
  __scaffoldEmptyInsertionCleanup?: () => void;
};

export interface EmptyInsertionTarget {
  pos: number;
  parentType: string;
}

type EmptyInsertionRowState = {
  movementDragActive: boolean;
};

type EmptyInsertionRowMeta = {
  movementDragActive: boolean;
  type: "setMovementDragActive";
};

const EMPTY_INSERTION_ROW_STATE: EmptyInsertionRowState = {
  movementDragActive: false,
};

export function setEmptyInsertionRowMovementDragActive(
  editor: Editor,
  movementDragActive: boolean,
): void {
  const current =
    EMPTY_INSERTION_ROW_PLUGIN_KEY.getState(editor.state)?.movementDragActive ?? false;
  if (current === movementDragActive) return;

  editor.view.dispatch(
    editor.state.tr.setMeta(EMPTY_INSERTION_ROW_PLUGIN_KEY, {
      movementDragActive,
      type: "setMovementDragActive",
    } satisfies EmptyInsertionRowMeta),
  );
}

export function isEmptyInsertionRowSuppressed(state: EditorState): boolean {
  if (EMPTY_INSERTION_ROW_PLUGIN_KEY.getState(state)?.movementDragActive) {
    return true;
  }

  const { owners } = publishInteractionOwnerSnapshot(state, null, {
    blockDefinitions: builtInBlockRegistry,
  });
  return isGridOrCellInsertionConflict(owners.menuOwner.target);
}

function isGridOrCellInsertionConflict(target: InteractionTargetRef | null): boolean {
  return target?.kind === InteractionTargetKind.Grid || target?.kind === InteractionTargetKind.Cell;
}

export function resolveEmptyInsertionTarget(
  state: EditorState,
  surfaceVariants: SurfaceVariantLookup,
): EmptyInsertionTarget | null {
  const { selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  const node = $from.parent;
  if (!node.isTextblock || node.type.name !== "paragraph") return null;
  if (!isNodeEmpty(node)) return null;
  if ($from.depth < 1) return null;

  const insertionParent = $from.node($from.depth - 1);
  const insertionParentDepth = $from.depth - 1;
  const insertionParentPos = insertionParentDepth > 0 ? $from.before(insertionParentDepth) : 0;
  if (!STRUCTURAL_INSERTION_PARENT_TYPES.has(insertionParent.type.name)) {
    return null;
  }
  if (!allowsSurfaceRootInsertion(insertionParent, surfaceVariants)) return null;
  if (
    !allowsBoundedContainerRootInsertionAtPosition({
      blockDefinitions: builtInBlockRegistry,
      doc: state.doc,
      pos: insertionParentPos,
    })
  ) {
    return null;
  }
  if (delegatesInsertionRowsToDirectChildHost(insertionParent)) return null;

  return {
    pos: selection.from,
    parentType: insertionParent.type.name,
  };
}

export function createEmptyInsertionRowExtension({
  surfaceVariants,
}: {
  surfaceVariants: SurfaceVariantLookup;
}) {
  return Extension.create({
    name: "emptyInsertionRow",

    addProseMirrorPlugins() {
      const editor = this.editor;

      return [
        new Plugin({
          key: EMPTY_INSERTION_ROW_PLUGIN_KEY,
          state: {
            init: () => EMPTY_INSERTION_ROW_STATE,
            apply(tr, value) {
              const meta = tr.getMeta(EMPTY_INSERTION_ROW_PLUGIN_KEY) as
                | EmptyInsertionRowMeta
                | undefined;
              if (meta?.type === "setMovementDragActive") {
                return { movementDragActive: meta.movementDragActive };
              }
              return value;
            },
          },
          view(editorView) {
            const handleMouseDown = (event: MouseEvent) => {
              const tr = insertEmptyParagraphForBlankParentClick(
                editor,
                editorView,
                event,
                surfaceVariants,
              );
              if (!tr) return;

              event.preventDefault();
              event.stopPropagation();
              editorView.dispatch(tr.scrollIntoView());
              editorView.focus();
            };

            editorView.dom.addEventListener("mousedown", handleMouseDown, true);

            return {
              destroy() {
                editorView.dom.removeEventListener("mousedown", handleMouseDown, true);
              },
            };
          },
          props: {
            decorations(state) {
              if (!editor.isEditable) return null;
              if (!shouldShowEmptyInsertionRowChrome(editor, state)) return null;

              const target = resolveEmptyInsertionTarget(state, surfaceVariants);
              if (!target) return null;

              return DecorationSet.create(state.doc, [
                Decoration.widget(
                  target.pos,
                  (_view, getPos) => createEmptyInsertionRow(editor, getPos),
                  {
                    key: `sc-empty-insertion-row-${target.pos}`,
                    side: 1,
                    ignoreSelection: true,
                    stopEvent(event) {
                      return ["mousedown", "mouseup", "click", "pointerdown", "pointerup"].includes(
                        event.type,
                      );
                    },
                    destroy(node) {
                      const element = node as EmptyInsertionRowElement;
                      element.__scaffoldEmptyInsertionCleanup?.();
                      delete element.__scaffoldEmptyInsertionCleanup;
                    },
                  },
                ),
              ]);
            },
            handleKeyDown(view, event) {
              if (event.key !== "Backspace" && event.key !== "Delete") return false;
              const tr = removeActiveEmptyInsertionLine(view.state, surfaceVariants);
              if (!tr) return false;

              event.preventDefault();
              view.dispatch(tr);
              return true;
            },
          },
        }),
      ];
    },
  });
}

function shouldShowEmptyInsertionRowChrome(editor: Editor, state: EditorState): boolean {
  return editor.isEditable && !isEmptyInsertionRowSuppressed(state);
}

function insertEmptyParagraphForBlankParentClick(
  editor: Editor,
  view: Editor["view"],
  event: MouseEvent,
  surfaceVariants: SurfaceVariantLookup,
): Transaction | null {
  if (!editor.isEditable) return null;
  if (event.defaultPrevented || event.button !== 0) return null;
  const target = event.target;
  if (!(target instanceof Element)) return null;
  if (isInteractiveClickTarget(target)) return null;

  const parentContext = resolveInsertionParentContext(view, target, event);
  if (!parentContext) return null;
  if (!allowsSurfaceRootInsertion(parentContext.node, surfaceVariants)) return null;
  if (
    !allowsBoundedContainerRootInsertionAtPosition({
      blockDefinitions: builtInBlockRegistry,
      doc: view.state.doc,
      pos: parentContext.pos,
    })
  ) {
    return null;
  }

  const lastChild = parentContext.node.lastChild;
  if (!lastChild || lastChild.isTextblock) return null;

  const lastChildElement = resolveChildElement(
    view,
    parentContext.pos,
    parentContext.node.childCount - 1,
  );
  if (!lastChildElement) return null;
  if (lastChildElement.contains(target)) return null;
  if (event.clientY <= lastChildElement.getBoundingClientRect().bottom) {
    return null;
  }

  const paragraphType = view.state.schema.nodes.paragraph;
  if (!paragraphType) return null;
  if (
    !parentContext.node.canReplaceWith(
      parentContext.node.childCount,
      parentContext.node.childCount,
      paragraphType,
    )
  ) {
    return null;
  }

  const insertPos = parentContext.pos + parentContext.node.nodeSize - 1;
  const tr = view.state.tr.insert(insertPos, paragraphType.create());
  tr.setSelection(Selection.near(tr.doc.resolve(insertPos + 1), 1));
  return tr;
}

function removeActiveEmptyInsertionLine(
  state: EditorState,
  surfaceVariants: SurfaceVariantLookup,
): Transaction | null {
  const target = resolveEmptyInsertionTarget(state, surfaceVariants);
  if (!target) return null;

  const { $from } = state.selection;
  if ($from.depth < 1) return null;

  const paragraphDepth = $from.depth;
  const parentDepth = paragraphDepth - 1;
  const paragraph = $from.node(paragraphDepth);
  const parent = $from.node(parentDepth);
  if (parent.childCount <= 1) return null;

  const from = $from.before(paragraphDepth);
  const to = from + paragraph.nodeSize;
  const tr = state.tr.delete(from, to);
  const selectionPos = Math.min(from, tr.doc.content.size);
  tr.setSelection(Selection.near(tr.doc.resolve(selectionPos), 1));
  return tr;
}

function insertionParentSelector(): string {
  return [
    "[data-surface]",
    '[data-node="region"]',
    '[data-authoring-frame="cell"]',
    '[data-authoring-frame="section"]',
    "[data-scaffold-accordion-panel]",
  ].join(",");
}

function resolveInsertionParentContext(
  view: Editor["view"],
  target: Element,
  event: MouseEvent,
): {
  node: EditorState["doc"];
  pos: number;
} | null {
  let resolved: {
    node: EditorState["doc"];
    pos: number;
  } | null = null;
  const targetElement = target instanceof HTMLElement ? target : target.parentElement;
  if (!targetElement) return null;
  const insertionParentMarker = insertionParentSelector();

  view.state.doc.descendants((node, pos) => {
    if (!STRUCTURAL_INSERTION_PARENT_TYPES.has(node.type.name)) return true;
    if (delegatesInsertionRowsToDirectChildHost(node)) return true;

    const nodeElement = view.nodeDOM(pos);
    if (!(nodeElement instanceof HTMLElement)) return true;

    const markerElement = nodeElement.matches(insertionParentMarker)
      ? nodeElement
      : nodeElement.querySelector<HTMLElement>(insertionParentMarker);
    const hitElement = markerElement ?? nodeElement;
    if (!pointInsideElement(nodeElement, event) && !pointInsideElement(hitElement, event)) {
      return true;
    }

    if (
      nodeElement !== targetElement &&
      !nodeElement.contains(targetElement) &&
      !targetElement.contains(nodeElement)
    ) {
      return true;
    }

    resolved = { node, pos };
    return true;
  });

  return resolved;
}

function delegatesInsertionRowsToDirectChildHost(node: EditorState["doc"]): boolean {
  for (let index = 0; index < node.childCount; index += 1) {
    if (STRUCTURAL_INSERTION_PARENT_TYPES.has(node.child(index).type.name)) {
      return true;
    }
  }

  return false;
}

function resolveChildElement(
  view: Editor["view"],
  parentPos: number,
  childIndex: number,
): HTMLElement | null {
  const parent = view.state.doc.nodeAt(parentPos);
  if (!parent || childIndex < 0 || childIndex >= parent.childCount) return null;

  let childPos = parentPos + 1;
  for (let index = 0; index < childIndex; index += 1) {
    childPos += parent.child(index).nodeSize;
  }

  const childElement = view.nodeDOM(childPos);
  return childElement instanceof HTMLElement ? childElement : null;
}

function pointInsideElement(element: HTMLElement, event: MouseEvent): boolean {
  const rect = element.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function isInteractiveClickTarget(target: Element): boolean {
  return Boolean(
    target.closest(
      [
        "a",
        "button",
        "input",
        "select",
        "textarea",
        '[contenteditable="false"]',
        "[data-empty-insertion-row]",
        "[data-no-select]",
      ].join(","),
    ),
  );
}

function createEmptyInsertionRow(
  editor: Editor,
  getPos: () => number | undefined,
): EmptyInsertionRowElement {
  const wrapper = document.createElement("span") as EmptyInsertionRowElement;
  wrapper.className = "sc-empty-insertion-row";
  wrapper.setAttribute("data-empty-insertion-row", "");
  wrapper.setAttribute("role", "group");
  wrapper.setAttribute("aria-label", "Empty insertion line");
  wrapper.contentEditable = "false";
  const focusEmptyLine = (event: Event) => {
    stopEvent(event);
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor.commands.setTextSelection(pos);
    editor.view.focus();
  };
  wrapper.addEventListener("mousedown", focusEmptyLine);
  wrapper.addEventListener("pointerdown", focusEmptyLine);
  wrapper.addEventListener("click", focusEmptyLine);

  const content = wrapper.appendChild(document.createElement("span"));
  content.className = "sc-empty-insertion-row__content";

  const prompt = content.appendChild(document.createElement("span"));
  prompt.className = "sc-empty-insertion-row__prompt";
  prompt.id = EMPTY_INSERTION_ROW_PROMPT_ID;
  prompt.append(EMPTY_INSERTION_ROW_PROMPT);

  content.appendChild(createAddBlockButton(editor, getPos));

  wrapper.__scaffoldEmptyInsertionCleanup = fitInsertionRow(wrapper, content);
  return wrapper;
}

function createAddBlockButton(editor: Editor, getPos: () => number | undefined): HTMLButtonElement {
  const button = createButton();
  button.dataset.emptyInsertionAction = "add-block";
  button.ariaLabel = "Add a block";
  button.setAttribute("aria-describedby", EMPTY_INSERTION_ROW_PROMPT_ID);
  button.title = "Add a block";
  button.append(createScaffoldMark());
  const activate = (event: Event) => {
    stopEvent(event);
    const pos = getPos();
    if (typeof pos === "number") {
      editor.commands.setTextSelection(pos);
    }
    editor.chain().focus().insertContent("/").run();
  };
  button.addEventListener("click", activate);
  button.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    activate(event);
  });
  return button;
}

function createButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sc-empty-insertion-row__button";
  button.addEventListener("mousedown", stopEvent);
  button.addEventListener("pointerdown", stopEvent);
  return button;
}

function createScaffoldMark(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("sc-empty-insertion-row__mark");

  // The register mark: four dashed registration corners (the add-slot
  // reduced to its corners) framing a bold plus. Single hue via
  // currentColor so it tints with the button's colour/hover state.
  svg.append(
    createMarkPath({
      d: "M5 24V5h19M40 5h19v19M59 40v19H40M24 59H5V40",
      strokeWidth: 2,
      dashed: true,
      opacity: 0.5,
    }),
    createMarkPath({ d: "M32 18v28M18 32h28", strokeWidth: 4.25 }),
  );

  return svg;
}

function createMarkPath({
  d,
  strokeWidth,
  dashed,
  opacity,
}: {
  d: string;
  strokeWidth: number;
  dashed?: boolean;
  opacity?: number;
}): SVGPathElement {
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", String(strokeWidth));
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  if (dashed) path.setAttribute("stroke-dasharray", "3 3");
  if (opacity !== undefined) path.setAttribute("opacity", String(opacity));
  return path;
}

function stopEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

function fitInsertionRow(wrapper: HTMLElement, content: HTMLElement): () => void {
  let frame = 0;
  const requestFrame =
    globalThis.requestAnimationFrame ??
    ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
  const cancelFrame =
    globalThis.cancelAnimationFrame ?? ((handle: number) => window.clearTimeout(handle));

  const update = () => {
    const parent = wrapper.parentElement;
    const available =
      parent?.clientWidth ||
      parent?.getBoundingClientRect().width ||
      wrapper.clientWidth ||
      wrapper.getBoundingClientRect().width;
    const natural =
      content.scrollWidth || content.getBoundingClientRect().width || content.offsetWidth;

    if (!available || !natural) return;

    const scale = Math.min(1, Math.max(MIN_SCALE, (available - 4) / natural));
    const height = content.offsetHeight || content.getBoundingClientRect().height || 24;

    wrapper.style.setProperty("--sc-empty-insertion-row-scale", scale.toFixed(3));
    wrapper.style.setProperty("--sc-empty-insertion-row-height", `${Math.ceil(height * scale)}px`);
  };

  const scheduleUpdate = () => {
    if (frame) cancelFrame(frame);
    frame = requestFrame(update);
  };

  scheduleUpdate();

  const observer = globalThis.ResizeObserver ? new ResizeObserver(scheduleUpdate) : null;
  if (observer) {
    observer.observe(wrapper);
    if (wrapper.parentElement) observer.observe(wrapper.parentElement);
    observer.observe(content);
  }
  window.addEventListener("resize", scheduleUpdate);

  return () => {
    if (frame) cancelFrame(frame);
    observer?.disconnect();
    window.removeEventListener("resize", scheduleUpdate);
  };
}
