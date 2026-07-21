import { Extension } from "@tiptap/core";

import { blockFrameStyle, normalizeBlockFrame } from "./block-frame";

const FRAME_ATTR = "data-frame";

export function createRuntimeBlockFrameAttributesExtension(
  resizableBlockNodeTypes: readonly string[],
): Extension {
  const types: readonly string[] = Object.freeze([...resizableBlockNodeTypes]);

  return Extension.create({
    name: "runtimeBlockFrameAttributes",

    addOptions() {
      return { resizableBlockNodeTypes: types };
    },

    addGlobalAttributes() {
      if (types.length === 0) return [];

      return [
        {
          types: [...types],
          attributes: {
            frame: {
              default: null,
              parseHTML: (element: HTMLElement) => {
                const raw = element.getAttribute(FRAME_ATTR);
                if (!raw) return null;

                try {
                  return normalizeBlockFrame(JSON.parse(raw));
                } catch {
                  return null;
                }
              },
              renderHTML: (attrs: Record<string, unknown>) => {
                if (!attrs["frame"]) return {};
                const frame = normalizeBlockFrame(attrs["frame"]);

                return {
                  [FRAME_ATTR]: JSON.stringify(frame),
                  style: blockFrameStyle(frame),
                };
              },
            },
          },
        },
      ];
    },
  });
}
