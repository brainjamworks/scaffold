import type { JSONContent } from "@tiptap/core";
import { EmbeddedDataIdSchema, EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { RewriteCopiedContent } from "@/editor/blocks/block-definition";
import {
  rewriteCategoriseCopiedContent,
  rewriteDropdownCopiedContent,
  rewriteFillBlanksCopiedContent,
  rewriteImageHotspotCopiedContent,
  rewriteMatchingCopiedContent,
  rewriteMcqCopiedContent,
  rewriteMultiselectCopiedContent,
  rewriteSequencingCopiedContent,
} from "./copy-identity";

const previousChildId = EmbeddedNodeIdSchema.parse("childold0001");
const nextChildId = EmbeddedNodeIdSchema.parse("childnew0001");

function rewriteAssessment(
  callback: RewriteCopiedContent,
  nodeType: string,
  assessment: Record<string, unknown>,
) {
  const content: JSONContent = {
    type: nodeType,
    attrs: { id: "blocknew0001", assessment },
  };
  const snapshot = structuredClone(content);
  const rewritten = callback({
    content,
    nodeIdChanges: new Map([[previousChildId, nextChildId]]),
    generators: {
      createDataId: () => {
        throw new Error("node-reference assessment copy must not allocate private Data identity");
      },
    },
  });

  expect(content).toEqual(snapshot);
  return rewritten.attrs?.["assessment"];
}

describe("assessment copy identity", () => {
  it("rewrites MCQ answer and feedback references without mutating its input", () => {
    const previousChoiceId = EmbeddedNodeIdSchema.parse("choiceold001");
    const nextChoiceId = EmbeddedNodeIdSchema.parse("choicenew001");
    const content: JSONContent = {
      type: "mcq",
      attrs: {
        id: "mcq_new_0001",
        assessment: {
          correctOptionId: previousChoiceId,
          feedbackByOptionId: {
            [previousChoiceId]: { kind: "feedback" },
          },
          summaryFeedback: { kind: "summary" },
        },
      },
      content: [{ type: "selectable_choice", attrs: { id: nextChoiceId } }],
    };
    const snapshot = structuredClone(content);

    const rewritten = rewriteMcqCopiedContent({
      content,
      nodeIdChanges: new Map([[previousChoiceId, nextChoiceId]]),
      generators: {
        createDataId: () => {
          throw new Error("MCQ copy must not allocate private Data identity");
        },
      },
    });

    expect(rewritten.attrs?.["assessment"]).toEqual({
      correctOptionId: nextChoiceId,
      feedbackByOptionId: {
        [nextChoiceId]: { kind: "feedback" },
      },
      summaryFeedback: { kind: "summary" },
    });
    expect(content).toEqual(snapshot);
  });

  it("rewrites Multiselect answer and feedback references", () => {
    expect(
      rewriteAssessment(rewriteMultiselectCopiedContent, "multiselect", {
        correctOptionIds: [previousChildId],
        feedbackByOptionId: { [previousChildId]: { kind: "feedback" } },
      }),
    ).toEqual({
      correctOptionIds: [nextChildId],
      feedbackByOptionId: { [nextChildId]: { kind: "feedback" } },
    });
  });

  it("rewrites Dropdown answer and feedback references", () => {
    expect(
      rewriteAssessment(rewriteDropdownCopiedContent, "dropdown", {
        correctOptionId: previousChildId,
        feedbackByOptionId: { [previousChildId]: { kind: "feedback" } },
      }),
    ).toEqual({
      correctOptionId: nextChildId,
      feedbackByOptionId: { [nextChildId]: { kind: "feedback" } },
    });
  });

  it("rewrites Fill Blank keyed assessment records", () => {
    expect(
      rewriteAssessment(rewriteFillBlanksCopiedContent, "fill_blanks", {
        blanksById: { [previousChildId]: { acceptedAnswers: ["answer"] } },
      }),
    ).toEqual({
      blanksById: { [nextChildId]: { acceptedAnswers: ["answer"] } },
    });
  });

  it("rewrites Sequencing order and feedback references", () => {
    expect(
      rewriteAssessment(rewriteSequencingCopiedContent, "sequencing", {
        correctOrder: [previousChildId],
        feedbackByItemId: { [previousChildId]: { kind: "feedback" } },
      }),
    ).toEqual({
      correctOrder: [nextChildId],
      feedbackByItemId: { [nextChildId]: { kind: "feedback" } },
    });
  });

  it("rewrites canonical Matching feedback references", () => {
    expect(
      rewriteAssessment(rewriteMatchingCopiedContent, "matching", {
        feedbackByItemId: { [previousChildId]: { kind: "feedback" } },
      }),
    ).toEqual({
      feedbackByItemId: { [nextChildId]: { kind: "feedback" } },
    });
  });

  it("rewrites canonical Categorise feedback references", () => {
    expect(
      rewriteAssessment(rewriteCategoriseCopiedContent, "categorise", {
        feedbackByItemId: { [previousChildId]: { kind: "feedback" } },
      }),
    ).toEqual({
      feedbackByItemId: { [nextChildId]: { kind: "feedback" } },
    });
  });

  it("regenerates Image Hotspot Data owners and references while preserving managed media", () => {
    const previousHotspotIds = [
      EmbeddedDataIdSchema.parse("hotspotold01"),
      EmbeddedDataIdSchema.parse("hotspotold02"),
    ] as const;
    const nextHotspotIds = [
      EmbeddedDataIdSchema.parse("hotspotnew01"),
      EmbeddedDataIdSchema.parse("hotspotnew02"),
    ] as const;
    const content: JSONContent = {
      type: "image_hotspot",
      attrs: {
        id: "hotspotblock",
        assessment: {
          correctHotspotIds: [previousHotspotIds[1]],
          feedbackByHotspotId: {
            [previousHotspotIds[0]]: { kind: "feedback" },
          },
        },
      },
      content: [
        {
          type: "image_hotspot_canvas",
          attrs: {
            data: {
              image: { mode: "managed", mediaId: "host-media-id", alt: "Diagram" },
              hotspots: previousHotspotIds.map((id, index) => ({
                id,
                centerX: 25 + index,
                centerY: 50,
                radius: 10,
              })),
            },
          },
        },
      ],
    };
    const snapshot = structuredClone(content);
    const allocatedIds = [...nextHotspotIds];

    const rewritten = rewriteImageHotspotCopiedContent({
      content,
      nodeIdChanges: new Map(),
      generators: {
        createDataId: () => {
          const id = allocatedIds.shift();
          if (!id) throw new Error("unexpected Hotspot Data identity allocation");
          return id;
        },
      },
    });

    expect(rewritten.attrs?.["assessment"]).toMatchObject({
      correctHotspotIds: [nextHotspotIds[1]],
      feedbackByHotspotId: {
        [nextHotspotIds[0]]: { kind: "feedback" },
      },
    });
    expect(rewritten.content?.[0]?.attrs?.["data"]).toMatchObject({
      image: { mode: "managed", mediaId: "host-media-id", alt: "Diagram" },
      hotspots: [{ id: nextHotspotIds[0] }, { id: nextHotspotIds[1] }],
    });
    expect(content).toEqual(snapshot);
  });
});
