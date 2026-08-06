import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import {
  ImageHotspotCanvasDataSchema,
  type HotspotItem,
  type ImageHotspotCanvasData,
} from "@scaffold/contracts";

export const IMAGE_HOTSPOT_CANVAS_NODE_TYPE = "image_hotspot_canvas";

export interface ImageHotspotCanvasNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function defaultImageHotspotCanvasData(): ImageHotspotCanvasData {
  return ImageHotspotCanvasDataSchema.parse({});
}

export function parseImageHotspotCanvasData(value: unknown): ImageHotspotCanvasData {
  const parsed = ImageHotspotCanvasDataSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : defaultImageHotspotCanvasData();
}

export function createImageHotspotCanvasNode(options: ImageHotspotCanvasNodeOptions = {}) {
  return Node.create({
    name: IMAGE_HOTSPOT_CANVAS_NODE_TYPE,
    atom: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      const dataDefault = defaultImageHotspotCanvasData();
      return {
        data: {
          default: dataDefault,
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-image-hotspot-canvas");
            if (!raw) return dataDefault;
            try {
              return parseImageHotspotCanvasData(JSON.parse(raw));
            } catch {
              return dataDefault;
            }
          },
          renderHTML: (attrs: { data: ImageHotspotCanvasData }) => ({
            "data-image-hotspot-canvas": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="image-hotspot-canvas"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-node": "image-hotspot-canvas",
        }),
      ];
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

export function patchHotspotInCanvasData(
  data: ImageHotspotCanvasData,
  id: string,
  patch: Partial<Omit<HotspotItem, "id">>,
): ImageHotspotCanvasData {
  return {
    ...data,
    hotspots: data.hotspots.map((h) => (h.id === id ? { ...h, ...patch } : h)),
  };
}

export function findHitHotspot(
  x: number,
  y: number,
  hotspots: readonly HotspotItem[],
  aspectRatio: number,
): HotspotItem | null {
  for (let i = hotspots.length - 1; i >= 0; i -= 1) {
    const h = hotspots[i]!;
    const dx = x - h.centerX;
    const dy = (y - h.centerY) * aspectRatio;
    if (Math.sqrt(dx * dx + dy * dy) <= h.radius) return h;
  }
  return null;
}

export interface PercentCoord {
  x: number;
  y: number;
}

export function eventToPercent(
  e: { clientX: number; clientY: number },
  container: HTMLElement,
): PercentCoord {
  const rect = container.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * 100,
    y: ((e.clientY - rect.top) / rect.height) * 100,
  };
}
