import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  ImageHotspotPrivateAssessmentSchema,
  ImageHotspotSettingsSchema,
  type ImageHotspotPrivateAssessment,
  type ImageHotspotSettings,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";

import { fullSlideQuestionStageAttributes } from "./full-slide-question-stage";

export const SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE = "surface_image_hotspot_question";

export interface SurfaceImageHotspotQuestionNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createSurfaceImageHotspotQuestionNode(
  options: SurfaceImageHotspotQuestionNodeOptions = {},
) {
  return Node.create({
    name: SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE,
    group: `${BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "image_hotspot_canvas assessment_actions_group",
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      const assessmentDefault: ImageHotspotPrivateAssessment =
        ImageHotspotPrivateAssessmentSchema.parse({});
      const settingsDefault: ImageHotspotSettings = ImageHotspotSettingsSchema.parse({});

      return {
        id: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
          renderHTML: (attrs: { id?: unknown }) =>
            typeof attrs.id === "string" && attrs.id.length > 0 ? { "data-id": attrs.id } : {},
        },
        settings: {
          ...jsonAttribute(
            "data-image-hotspot-settings",
            settingsDefault,
            ImageHotspotSettingsSchema,
          ),
          renderHTML: (attrs: { settings: ImageHotspotSettings }) => ({
            "data-image-hotspot-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...jsonAttribute(
            "data-image-hotspot-assessment",
            assessmentDefault,
            ImageHotspotPrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-node="${SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(
          HTMLAttributes,
          {
            "data-node": SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE,
            "data-surface-assessment-question": "",
          },
          fullSlideQuestionStageAttributes(SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE),
        ),
        0,
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

export const SurfaceImageHotspotQuestionNode = createSurfaceImageHotspotQuestionNode();

function jsonAttribute<T>(
  htmlKey: string,
  defaultValue: T,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
) {
  return {
    default: defaultValue,
    parseHTML: (element: HTMLElement) => {
      const raw = element.getAttribute(htmlKey);
      if (!raw) return defaultValue;
      try {
        const parsed = schema.safeParse(JSON.parse(raw));
        return parsed.success && parsed.data !== undefined ? parsed.data : defaultValue;
      } catch {
        return defaultValue;
      }
    },
  };
}
