import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import {
  ASSESSMENT_QUESTION_CONTENT,
  COURSE_BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import {
  ImageHotspotPrivateAssessmentSchema,
  ImageHotspotSettingsSchema,
  type ImageHotspotPrivateAssessment,
  type ImageHotspotSettings,
} from "@scaffold/contracts";

/**
 * Composite Image Hotspot node. Reuses the standard assessment shell
 * (title / instructions / prompt / hints / summary feedback) with one
 * atomic `image_hotspot_canvas` child owning the entire interactive
 * surface (image picker + SVG overlay for hotspot author UI; click
 * markers + popovers for runtime UX). See
 * `.agents/rules/block-types.md` — Composite shell + atomic canvas
 * recipe.
 */
export interface ImageHotspotNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createImageHotspotNode(options: ImageHotspotNodeOptions = {}) {
  return Node.create({
    name: "image_hotspot",
    group: `block ${COURSE_BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "image_hotspot_canvas assessment_actions_group",
    defining: true,
    draggable: false,

    addAttributes() {
      const assessmentDefault: ImageHotspotPrivateAssessment =
        ImageHotspotPrivateAssessmentSchema.parse({});
      const settingsDefault: ImageHotspotSettings = ImageHotspotSettingsSchema.parse({});

      const makeAttr = <T>(
        htmlKey: string,
        defaultValue: T,
        schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
      ) => ({
        default: defaultValue,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute(htmlKey);
          if (!raw) return defaultValue;
          try {
            const parsed = schema.safeParse(JSON.parse(raw));
            return parsed.success && parsed.data !== undefined ? parsed.data : defaultValue;
          } catch {
            return defaultValue;
          }
        },
      });

      return {
        id: stableNodeIdAttribute(),
        settings: {
          ...makeAttr("data-image-hotspot-settings", settingsDefault, ImageHotspotSettingsSchema),
          renderHTML: (attrs: { settings: ImageHotspotSettings }) => ({
            "data-image-hotspot-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...makeAttr(
            "data-image-hotspot-assessment",
            assessmentDefault,
            ImageHotspotPrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="image_hotspot"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "image_hotspot" }), 0];
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

export const ImageHotspotNode = createImageHotspotNode();
