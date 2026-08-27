import { normalizeControlDefinition, type ControlDefinition } from "@/document/control-binding";

const definition = normalizeControlDefinition({
  owner: {
    events: [{ type: "launched", label: "Resource launched" }],
  },
} satisfies ControlDefinition);

if (!definition) {
  throw new Error("Resource Link Control Definition must not normalize to empty.");
}

/** Root-only event vocabulary for a runtime Resource Link. */
export const resourceLinkControlDefinition = definition;
