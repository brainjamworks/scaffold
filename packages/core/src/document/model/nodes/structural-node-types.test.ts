import { describe, expect, it } from "vite-plus/test";

import {
  CELL_NODE_TYPE as GRID_CELL_NODE_TYPE,
  GRID_NODE_TYPE as ARRANGEMENT_GRID_NODE_TYPE,
} from "@/editor/arrangements/grid/model/grid-nodes";
import {
  LAYOUT_NODE_TYPE as ARRANGEMENT_LAYOUT_NODE_TYPE,
  SECTION_NODE_TYPE as LAYOUT_SECTION_NODE_TYPE,
} from "@/editor/arrangements/layout/model/layout-nodes";
import { REGION_NODE_TYPE as SURFACE_REGION_NODE_TYPE } from "@/editor/surfaces/model/nodes/region-node";
import { SURFACE_NODE_TYPE as EDITOR_SURFACE_NODE_TYPE } from "@/editor/surfaces/model/nodes/surface-node";

import {
  CELL_NODE_TYPE,
  COURSE_SECTION_NODE_TYPE,
  GRID_NODE_TYPE,
  LAYOUT_NODE_TYPE,
  REGION_NODE_TYPE,
  SECTION_NODE_TYPE,
  SURFACE_NODE_TYPE,
} from "./structural-node-types";

describe("structural document node vocabulary", () => {
  it("owns the canonical names below document and editor consumers", () => {
    expect({
      CELL_NODE_TYPE,
      COURSE_SECTION_NODE_TYPE,
      GRID_NODE_TYPE,
      LAYOUT_NODE_TYPE,
      REGION_NODE_TYPE,
      SECTION_NODE_TYPE,
      SURFACE_NODE_TYPE,
    }).toEqual({
      CELL_NODE_TYPE: "cell",
      COURSE_SECTION_NODE_TYPE: "courseSection",
      GRID_NODE_TYPE: "grid",
      LAYOUT_NODE_TYPE: "layout",
      REGION_NODE_TYPE: "region",
      SECTION_NODE_TYPE: "section",
      SURFACE_NODE_TYPE: "surface",
    });
    expect(ARRANGEMENT_GRID_NODE_TYPE).toBe(GRID_NODE_TYPE);
    expect(GRID_CELL_NODE_TYPE).toBe(CELL_NODE_TYPE);
    expect(ARRANGEMENT_LAYOUT_NODE_TYPE).toBe(LAYOUT_NODE_TYPE);
    expect(LAYOUT_SECTION_NODE_TYPE).toBe(SECTION_NODE_TYPE);
    expect(SURFACE_REGION_NODE_TYPE).toBe(REGION_NODE_TYPE);
    expect(EDITOR_SURFACE_NODE_TYPE).toBe(SURFACE_NODE_TYPE);
  });
});
