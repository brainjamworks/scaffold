import { ProcessFlowDataSchema, type ProcessFlowData } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";

export const PROCESS_FLOW_NODE = "process_flow";
export const PROCESS_FLOW_STEP_NODE = "process_flow_step";

const DEFAULT_STEPS = [
  { title: "Research", description: "Gather what you need before you start." },
  { title: "Draft", description: "Make a first version without over-polishing." },
  { title: "Review", description: "Check it against the brief, then refine." },
] as const;

export interface ProcessFlowStepSeed {
  title: string;
  description?: string;
}

export function emptyProcessFlowData(
  overrides: Partial<ProcessFlowData> = {},
): ProcessFlowData {
  return ProcessFlowDataSchema.parse(overrides);
}

export function createProcessFlowContent(
  options: Partial<ProcessFlowData> = {},
): JSONContent {
  return {
    type: PROCESS_FLOW_NODE,
    attrs: {
      id: createEmbeddedNodeId(),
      data: emptyProcessFlowData(options),
    },
    content: DEFAULT_STEPS.map((step, index) => createProcessFlowStep(index, step)),
  };
}

export function createProcessFlowStep(
  _index: number,
  seed?: ProcessFlowStepSeed,
): JSONContent {
  const title: JSONContent = {
    type: "paragraph",
    ...(seed?.title ? { content: [{ type: "text", text: seed.title }] } : {}),
  };
  const description = seed?.description
    ? {
        type: "paragraph",
        content: [{ type: "text", text: seed.description }],
      }
    : null;

  return {
    type: PROCESS_FLOW_STEP_NODE,
    attrs: { id: createEmbeddedNodeId() },
    content: description ? [title, description] : [title],
  };
}
