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
import { slideDragDropQuestionSurfaceDefinition } from "@/editor/surfaces/model/templates/assessment/slide-drag-drop-question";
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
  "drag_drop",
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
      const insertBlock = definition?.insert?.content() as JSONContent | undefined;
      if (!insertBlock) throw new Error(`${nodeType} has no insert content`);
      const authoredBlock = completeAssessmentFixture(nodeType, insertBlock);

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

  it("reports an incomplete Drag and Drop question as unavailable content instead of throwing", () => {
    const blockDefinition = builtInBlockRegistry.getByNodeType("drag_drop");
    const draftBlock = blockDefinition?.insert?.content() as JSONContent | undefined;
    if (!draftBlock) throw new Error("drag_drop has no insert content");
    const pageDocument = createScaffoldDocumentContent({ mode: "page" });
    const pageSurface = pageDocument.content?.[0]?.content?.[0];
    if (!pageSurface) throw new Error("Assessment publication fixture has no surface");
    pageSurface.content = [draftBlock];
    assignMissingNodeIds(pageDocument);
    const blockPublication = projectLearnerPublication(
      {
        status: "supported",
        canonicalDocument: authoringSchema.nodeFromJSON(pageDocument).toJSON(),
      },
      builtInBlockRegistry,
      builtInSurfaceVariantRegistry,
    );
    expect(blockPublication.status).toBe("unavailable-content");
    if (blockPublication.status !== "unavailable-content") {
      throw new Error("Expected unavailable-content for an incomplete Drag and Drop block");
    }
    expect(blockPublication.unavailableContent).toHaveLength(1);
    expect(blockPublication.unavailableContent[0]).toMatchObject({
      kind: "block",
      capabilityId: "drag_drop",
    });

    const slideshowDocument = createScaffoldDocumentContent({
      mode: "slideshow",
      initialCourseSectionTitle: "Assessment",
    });
    const courseDocument = slideshowDocument.content?.[0];
    if (!courseDocument) throw new Error("Assessment publication fixture has no course document");
    const surfaceId = createEmbeddedNodeId();
    courseDocument.content = [
      ...(courseDocument.content ?? []).filter((node) => node.type === "courseSection"),
      slideDragDropQuestionSurfaceDefinition.createSurface({ surfaceId }),
    ];
    assignMissingNodeIds(slideshowDocument);
    const surfacePublication = projectLearnerPublication(
      {
        status: "supported",
        canonicalDocument: authoringSchema.nodeFromJSON(slideshowDocument).toJSON(),
      },
      builtInBlockRegistry,
      builtInSurfaceVariantRegistry,
    );
    expect(surfacePublication.status).toBe("unavailable-content");
    if (surfacePublication.status !== "unavailable-content") {
      throw new Error("Expected unavailable-content for an incomplete Drag and Drop surface");
    }
    expect(surfacePublication.unavailableContent).toEqual([
      {
        kind: "surface",
        capabilityId: "slide-drag-drop-question",
        stableId: surfaceId,
        path: [],
      },
    ]);
  });
});

function completeAssessmentFixture(nodeType: string, block: JSONContent): JSONContent {
  if (nodeType !== "drag_drop") return block;
  return {
    ...block,
    attrs: {
      ...block.attrs,
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        gradingMode: "partial-credit",
        points: 4,
        maxAttempts: 2,
        legend: "Place city markers",
      },
      assessment: {
        correctPlacements: [
          {
            markerId: "marker000001",
            geometry: { kind: "circle", centerX: 25, centerY: 60, radius: 7 },
          },
        ],
        feedbackByMarkerId: {},
        summaryFeedback: null,
      },
    },
    content: (block.content ?? []).map((child) =>
      child.type === "drag_drop_canvas"
        ? {
            ...child,
            attrs: {
              ...child.attrs,
              data: {
                image: { mode: "managed", mediaId: "media0000001", alt: "Map" },
                imageAspectRatio: 2,
                defaultMarkerVisual: { kind: "preset", preset: "dot" },
                markers: [{ id: "marker000001", label: "London", visualOverride: null }],
              },
            },
          }
        : child,
    ),
  };
}

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
