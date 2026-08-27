import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { slideCategoriseQuestionSurfaceDefinition } from "@/editor/surfaces/model/templates/assessment/slide-categorise-question";
import { slideSequencingQuestionSurfaceDefinition } from "@/editor/surfaces/model/templates/assessment/slide-sequencing-question";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { prepareRuntimeLearnerPublication } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";

import { projectLearnerPublication } from "./document-projection";

const runtimeComposition = createCoreScaffoldRuntimeComposition();
const authoringSchema = getCourseDocumentAuthoringEnvironmentState(
  createCourseDocumentAuthoringEnvironment({
    composition: createCoreScaffoldAuthoringComposition(),
  }),
).schema;
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;
const assessmentNodeTypes = [
  "categorise",
  "dropdown",
  "fill_blanks",
  "image_hotspot",
  "matching",
  "mcq",
  "multiselect",
  "sequencing",
] as const;

describe("assessment learner publication runtime compatibility", () => {
  it("covers every registered assessment target block", () => {
    expect([...builtInBlockRegistry.assessmentNodeTypes].sort()).toEqual(assessmentNodeTypes);
  });

  it.each(assessmentNodeTypes)(
    "projects %s into private-data-free content accepted by the runtime schema",
    (nodeType) => {
      const definition = builtInBlockRegistry.getByNodeType(nodeType);
      const authoredBlock = definition?.insert?.content() as JSONContent | undefined;
      if (!authoredBlock) throw new Error(`${nodeType} has no insert content`);

      const insertDocument = createScaffoldDocumentContent({ mode: "page" });
      const surface = insertDocument.content?.[0]?.content?.[0];
      if (!surface) throw new Error("Assessment publication fixture has no surface");
      surface.content = [authoredBlock];
      assignMissingNodeIds(insertDocument);
      const canonicalDocument = authoringSchema.nodeFromJSON(insertDocument).toJSON();

      const publication = projectLearnerPublication(
        { status: "supported", canonicalDocument },
        builtInBlockRegistry,
        builtInSurfaceVariantRegistry,
      );
      if (publication.status !== "supported") {
        throw new Error(`Expected supported publication for ${nodeType}`);
      }

      const summaryFeedback = descendantsByType(
        publication.learnerContent,
        "assessment_summary_feedback",
      );
      expect(summaryFeedback).toHaveLength(1);
      expect(summaryFeedback[0]?.content).toBeUndefined();
      expect(JSON.stringify(publication.learnerContent)).not.toContain('"assessment":');

      const readiness = prepareRuntimeLearnerPublication(
        { status: "supported", learnerContent: publication.learnerContent },
        runtimeComposition,
        coreProductAccess,
      );
      expect(readiness.status).toBe("supported");
      if (readiness.status !== "supported") {
        throw new Error(`Expected supported runtime readiness for ${nodeType}`);
      }
      expect(readiness.preparedDocument.content).toEqual(publication.learnerContent);
      expect(readiness.preparedDocument.composition).toBe(runtimeComposition);
    },
  );

  it("projects a Surface-owned Categorise question into learner content accepted by runtime", () => {
    const insertDocument = createScaffoldDocumentContent({
      mode: "slideshow",
      initialCourseSectionTitle: "Assessment",
    });
    const courseDocument = insertDocument.content?.[0];
    if (!courseDocument) throw new Error("Assessment publication fixture has no course document");
    courseDocument.content = [
      ...(courseDocument.content ?? []).filter((node) => node.type === "courseSection"),
      slideCategoriseQuestionSurfaceDefinition.createSurface({
        surfaceId: createEmbeddedNodeId(),
      }),
    ];
    assignMissingNodeIds(insertDocument);
    const canonicalDocument = authoringSchema.nodeFromJSON(insertDocument).toJSON();

    const publication = projectLearnerPublication(
      { status: "supported", canonicalDocument },
      builtInBlockRegistry,
      builtInSurfaceVariantRegistry,
    );
    if (publication.status !== "supported") {
      throw new Error("Expected supported publication for Surface-owned Categorise");
    }

    expect(publication.assessmentTargets).toHaveLength(1);
    expect(publication.assessmentTargets[0]).toMatchObject({
      blockType: "categorise",
      interaction: { kind: "classify" },
      assessment: { kind: "classify" },
    });
    expect(JSON.stringify(publication.learnerContent)).not.toContain('"assessment":');

    const readiness = prepareRuntimeLearnerPublication(
      { status: "supported", learnerContent: publication.learnerContent },
      runtimeComposition,
      coreProductAccess,
    );
    expect(readiness.status).toBe("supported");
  });

  it("projects a Surface-owned Sequencing question into learner content accepted by runtime", () => {
    const insertDocument = createScaffoldDocumentContent({
      mode: "slideshow",
      initialCourseSectionTitle: "Assessment",
    });
    const courseDocument = insertDocument.content?.[0];
    if (!courseDocument) throw new Error("Assessment publication fixture has no course document");
    courseDocument.content = [
      ...(courseDocument.content ?? []).filter((node) => node.type === "courseSection"),
      slideSequencingQuestionSurfaceDefinition.createSurface({
        surfaceId: createEmbeddedNodeId(),
      }),
    ];
    assignMissingNodeIds(insertDocument);
    const canonicalDocument = authoringSchema.nodeFromJSON(insertDocument).toJSON();

    const publication = projectLearnerPublication(
      { status: "supported", canonicalDocument },
      builtInBlockRegistry,
      builtInSurfaceVariantRegistry,
    );
    if (publication.status !== "supported") {
      throw new Error("Expected supported publication for Surface-owned Sequencing");
    }

    expect(publication.assessmentTargets).toHaveLength(1);
    expect(publication.assessmentTargets[0]).toMatchObject({
      blockType: "sequencing",
      interaction: { kind: "sequence" },
      assessment: { kind: "sequence" },
    });
    expect(JSON.stringify(publication.learnerContent)).not.toContain('"assessment":');

    const readiness = prepareRuntimeLearnerPublication(
      { status: "supported", learnerContent: publication.learnerContent },
      runtimeComposition,
      coreProductAccess,
    );
    expect(readiness.status).toBe("supported");
  });
});

function descendantsByType(root: JSONContent, type: string): JSONContent[] {
  const matches: JSONContent[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === type) matches.push(node);
    stack.push(...(node.content ?? []));
  }
  return matches;
}

function assignMissingNodeIds(root: JSONContent): void {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "doc" && node.type !== "text") {
      node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
    }
    stack.push(...(node.content ?? []));
  }
}
