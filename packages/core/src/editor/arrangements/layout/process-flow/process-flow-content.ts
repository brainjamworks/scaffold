import type { JSONContent } from "@tiptap/core";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";

export interface ProcessFlowOptions {
  showNumbers: boolean;
  showConnectors: boolean;
  orientation: "horizontal" | "vertical";
}

const DEFAULT_STEPS: readonly { heading: string; body: string }[] = [
  { heading: "Research", body: "Gather what you need before you start." },
  { heading: "Draft", body: "Make a first version without over-polishing." },
  { heading: "Review", body: "Check it against the brief, then refine." },
];

export function createProcessFlowContent(
  options: Partial<ProcessFlowOptions> | undefined,
): JSONContent {
  return {
    type: "layout",
    attrs: {
      id: createEmbeddedNodeId(),
      variant: "process-flow",
      options: {
        showNumbers: options?.showNumbers ?? true,
        showConnectors: options?.showConnectors ?? true,
        orientation: options?.orientation ?? "horizontal",
      },
    },
    content: DEFAULT_STEPS.map((step, index) => createProcessFlowSection(index, step)),
  };
}

export function createProcessFlowSection(
  _index: number,
  seed?: { heading: string; body: string },
): JSONContent {
  return {
    type: "section",
    attrs: {
      id: createEmbeddedNodeId(),
      role: "process-flow-section",
    },
    content: [
      {
        type: "paragraph",
        ...(seed?.heading ? { content: [{ type: "text", text: seed.heading }] } : {}),
      },
      {
        type: "paragraph",
        ...(seed?.body ? { content: [{ type: "text", text: seed.body }] } : {}),
      },
    ],
  };
}
