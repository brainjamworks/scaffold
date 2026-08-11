import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import type { LearnerPublicationProjection } from "./document-projection";
import {
  ARTIFACT_SAVE_PAYLOAD_LIMITS,
  createArtifactSavePayload,
  validateLearnerPublicationPayloadSize,
} from "./artifact-save-bundle";

describe("artifact persistence and publication payload boundaries", () => {
  it("creates a canonical-only save payload without learner publication output", () => {
    const authorDocument: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph" }],
    };

    const payload = createArtifactSavePayload({
      artifact: artifact("doc-1", "Draft title", authorDocument),
    });

    expect(payload).toEqual({
      artifact: {
        id: "doc-1",
        title: "Draft title",
        mode: "page",
        content: authorDocument,
      },
    });
    expect(payload).not.toHaveProperty("learnerContent");
    expect(payload).not.toHaveProperty("assessmentTargets");
    expect(payload).not.toHaveProperty("assessmentGroups");
  });

  it("does not impose an arbitrary canonical artifact size ceiling", () => {
    const payload = createArtifactSavePayload({
      artifact: artifact("doc-1", "Large canonical document", oversizedCanonicalDocument()),
    });

    expect(payload.artifact.content.content?.[0]?.content?.[0]?.text?.length).toBeGreaterThan(
      2 * 1024 * 1024,
    );
    expect(ARTIFACT_SAVE_PAYLOAD_LIMITS).not.toHaveProperty("artifactContentBytes");
  });

  it("validates learner content only when a supported publication payload exists", () => {
    const publication: LearnerPublicationProjection = {
      status: "supported",
      learnerContent: oversizedDocument("learnerContentBytes"),
      assessmentTargets: [],
      assessmentGroups: [],
      warnings: [],
    };

    expect(() => validateLearnerPublicationPayloadSize(publication)).toThrow(
      /Learner content is too large to publish/,
    );
  });

  it("validates assessment payloads independently from canonical persistence", () => {
    const publication: LearnerPublicationProjection = {
      status: "supported",
      learnerContent: { type: "doc" },
      assessmentTargets: [
        {
          padding: "x".repeat(ARTIFACT_SAVE_PAYLOAD_LIMITS.assessmentTargetsBytes),
        } as never,
      ],
      assessmentGroups: [],
      warnings: [],
    };

    expect(() => validateLearnerPublicationPayloadSize(publication)).toThrow(
      /Assessment targets are too large to publish/,
    );
  });
});

function oversizedDocument(limit: "learnerContentBytes"): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "x".repeat(ARTIFACT_SAVE_PAYLOAD_LIMITS[limit] + 1),
          },
        ],
      },
    ],
  };
}

function oversizedCanonicalDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "x".repeat(2 * 1024 * 1024 + 1) }],
      },
    ],
  };
}

function artifact(id: string, title: string, content: JSONContent) {
  return {
    id,
    title,
    mode: "page" as const,
    content,
  };
}
