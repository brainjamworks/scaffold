import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { DragDropCanvasDataSchema, type DragDropCanvasData } from "@scaffold/contracts";

export const DRAG_DROP_CANVAS_NODE_TYPE = "drag_drop_canvas";

export interface DragDropCanvasNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function defaultDragDropCanvasData(): DragDropCanvasData {
  return DragDropCanvasDataSchema.parse({
    defaultMarkerVisual: { kind: "preset", preset: "dot" },
  });
}

export function parseDragDropCanvasData(value: unknown): DragDropCanvasData {
  return DragDropCanvasDataSchema.parse(value);
}

export function createDragDropCanvasNode(options: DragDropCanvasNodeOptions = {}) {
  return Node.create({
    name: DRAG_DROP_CANVAS_NODE_TYPE,
    atom: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      const defaultData = defaultDragDropCanvasData();
      return {
        data: {
          default: defaultData,
          parseHTML: (element: HTMLElement) => {
            const raw = element.getAttribute("data-drag-drop-canvas");
            return raw === null ? defaultData : parseDragDropCanvasData(JSON.parse(raw));
          },
          renderHTML: (attrs: { data: DragDropCanvasData }) => ({
            "data-drag-drop-canvas": JSON.stringify(parseDragDropCanvasData(attrs.data)),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="drag-drop-canvas"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "drag-drop-canvas" })];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export const DragDropCanvasNode = createDragDropCanvasNode();
