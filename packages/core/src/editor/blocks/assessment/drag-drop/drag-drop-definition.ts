import { MapPinIcon as MapPin } from "@phosphor-icons/react";
import { DragDropPrivateAssessmentSchema, DragDropSettingsSchema } from "@scaffold/contracts";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { defineAssessmentCapability, defineBlock } from "@/editor/blocks/block-definition";
import { assessmentShellPlaceholders } from "@/editor/blocks/assessment/shared/nodes/assessment-placeholders";
import { pageAssessmentExperience } from "@/editor/assessment/shared/model/assessment-capability";
import { assessmentControlDefinition } from "@/editor/assessment/shared/model/assessment-control-definition";
import { createAssessmentConfiguration } from "@/editor/configuration/assessment-configuration";
import type { ConfigurationControlDescriptor } from "@/editor/configuration/definition";

import {
  projectDragDropAssessment,
  projectDragDropInteraction,
  projectDragDropLearnerNode,
  projectDragDropSettings,
} from "@/editor/assessment/drag-drop/assessment";
import { defaultDragDropCanvasData } from "@/editor/assessment/drag-drop/drag-drop-canvas-shared";
import { dragDropResponseCodec } from "@/editor/assessment/drag-drop/drag-drop-response-codec";

export const DRAG_DROP_INSERT_ACTION_ID = "drag-drop";

export const dragDropConfiguration = createAssessmentConfiguration({
  schema: DragDropSettingsSchema,
  title: "Drag and Drop settings",
  defaultOpenSections: ["scoring"],
  sections: [
    { id: "scoring", title: "Scoring" },
    { id: "attempts", title: "Attempts" },
    { id: "presentation", title: "Presentation" },
  ],
  controls: [
    {
      kind: "select",
      name: "gradingMode",
      label: "Grading",
      description: "Give equal partial credit per marker or require every marker to be correct.",
      options: [
        { value: "partial-credit", label: "Partial credit" },
        { value: "all-or-nothing", label: "All or nothing" },
      ],
      placement: { sheet: { section: "scoring" } },
    },
    {
      kind: "number",
      name: "points",
      label: "Points",
      min: 0,
      step: 1,
      integer: true,
      placement: { sheet: { section: "scoring" } },
    },
    {
      kind: "number",
      name: "maxAttempts",
      label: "Max attempts",
      description: "Leave blank to allow unlimited attempts.",
      min: 1,
      step: 1,
      integer: true,
      emptyValue: null,
      placement: { sheet: { section: "attempts" } },
    },
    {
      kind: "text",
      name: "legend",
      label: "Accessible response label",
      description: "Describe the marker placement area when the prompt does not.",
      placement: { sheet: { section: "presentation" } },
    },
  ] satisfies ConfigurationControlDescriptor[],
});

export const dragDropBlockDefinition = defineBlock({
  nodeType: "drag_drop",
  title: "Drag and Drop",
  control: assessmentControlDefinition,
  configuration: dragDropConfiguration,
  placeholders: assessmentShellPlaceholders,
  boundedPlacement: "fill",
  capabilities: {
    assessment: defineAssessmentCapability({
      interactionKind: "spatial-placement",
      experience: pageAssessmentExperience,
      response: dragDropResponseCodec,
      projection: {
        projectInteraction: projectDragDropInteraction,
        projectAssessment: projectDragDropAssessment,
        projectSettings: projectDragDropSettings,
        projectLearnerNode: projectDragDropLearnerNode,
      },
    }),
  },
  frame: {
    preserveAspectRatio: true,
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: DRAG_DROP_INSERT_ACTION_ID,
    category: "assessment",
    title: "Drag and Drop",
    description: "Place named markers on an image",
    icon: MapPin,
    keywords: ["drag", "drop", "image", "marker", "map", "spatial"],
    content: () => ({
      type: "drag_drop",
      attrs: {
        id: createEmbeddedNodeId(),
        assessment: DragDropPrivateAssessmentSchema.parse({}),
        settings: DragDropSettingsSchema.parse({
          legend: "Place each marker on the image",
        }),
      },
      content: [
        {
          type: "assessment_title",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Drag and Drop" }] }],
        },
        {
          type: "assessment_instructions",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Place each marker on the image" }],
            },
          ],
        },
        { type: "assessment_prompt", content: [{ type: "paragraph" }] },
        {
          type: "drag_drop_canvas",
          attrs: { id: createEmbeddedNodeId(), data: defaultDragDropCanvasData() },
        },
        {
          type: "assessment_actions_group",
          content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
        },
      ],
    }),
  },
});
