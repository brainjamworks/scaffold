import { LAYER_NODE_TYPE } from "@/document/model/nodes/structural-node-types";

export const STRUCTURAL_INSERTION_PARENT_TYPES = new Set([
  "surface",
  "region",
  "cell",
  "section",
  "accordion_section_panel",
  LAYER_NODE_TYPE,
]);
