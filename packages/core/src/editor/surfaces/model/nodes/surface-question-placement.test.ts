import { Fragment } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";

// Uses the real production authoring schema (RIZ-303): after the group fix,
// surface-*-question nodes carry only `assessment_question`, regions accept
// `(block | arrangement)+`, and surfaces accept assessment_question children.
const authoringSchema = getCourseDocumentAuthoringEnvironmentState(
  createCourseDocumentAuthoringEnvironment({
    composition: createCoreScaffoldAuthoringComposition(),
  }),
).schema;

const surfaceType = authoringSchema.nodes["surface"]!;
const regionType = authoringSchema.nodes["region"]!;

const questionNodeNames = Object.keys(authoringSchema.nodes).filter((name) =>
  name.endsWith("_question"),
);

describe("surface question placement", () => {
  it("covers all nine surface question nodes", () => {
    expect(questionNodeNames).toHaveLength(9);
  });

  it.each(questionNodeNames)("rejects %s inside a region", (nodeName) => {
    const question = authoringSchema.nodes[nodeName]!.create();
    expect(regionType.validContent(Fragment.from(question))).toBe(false);
  });

  it.each(questionNodeNames)("accepts %s as a direct surface child", (nodeName) => {
    const question = authoringSchema.nodes[nodeName]!.create();
    expect(surfaceType.validContent(Fragment.from(question))).toBe(true);
  });

  it("fails doc.check for a region-nested surface question", () => {
    const misnested = authoringSchema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "region",
                  content: [{ type: "surface_drag_drop_question" }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(() => misnested.check()).toThrow();
  });
});
