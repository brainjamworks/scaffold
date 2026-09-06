import { ScaffoldDocumentContentSchema } from "@scaffold/contracts";
import { Schema } from "@tiptap/pm/model";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type { DocumentCapabilityLookups } from "@/document/model/establishment";
import { establishAuthoringDocument } from "@/document/model/establishment";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { ARTIFACT_SAVE_PAYLOAD_LIMITS } from "./artifact-save-bundle";
import {
  prepareLearnerContent,
  type LearnerContentPreparationError,
  type LearnerPreparationContext,
} from "./prepare-learner-content";

const schema = new Schema({
  nodes: {
    doc: { content: "courseDocument" },
    courseDocument: {
      attrs: {
        id: { default: null },
        schemaVersion: { default: SCAFFOLD_DOCUMENT_FORMAT_VERSION },
        requiresScaffoldPlus: { default: false },
        mode: { default: "page" },
        surfaceSize: { default: "fluid" },
        overflowMode: { default: "grow" },
        theme: { default: null },
      },
      content: "surface+",
    },
    surface: {
      attrs: { id: { default: null }, variant: { default: null }, settings: { default: {} } },
      content: "(known_block | assessment_block | quiz | paragraph | unavailable_block)+",
    },
    known_block: { attrs: { id: { default: null }, data: { default: null } } },
    assessment_block: { attrs: { id: { default: null } } },
    quiz: { attrs: { id: { default: null }, settings: { default: {} } }, content: "known_block+" },
    paragraph: { attrs: { id: { default: null } }, content: "text*" },
    unavailable_block: {
      attrs: { id: { default: null }, capabilityId: {}, original: {} },
      atom: true,
    },
    text: {},
  },
});

const assessmentDefinition = {
  nodeType: "assessment_block",
  title: "Assessment",
  capabilities: {
    assessment: {
      projection: { projectLearnerNode: (node: unknown) => node },
    },
  },
} as never;

const capabilities: DocumentCapabilityLookups = {
  blocks: {
    getByNodeType: (type) => {
      if (type === "known_block") {
        return {
          nodeType: type,
          title: "Known",
          attrSchemas: { data: z.object({ count: z.number() }) },
        } as never;
      }
      if (type === "quiz") return { nodeType: type, title: "Quiz" } as never;
      return type === "assessment_block" ? assessmentDefinition : undefined;
    },
  },
  layouts: { getById: () => undefined },
  surfaces: {
    get: (id) =>
      id === "known-surface" ? ({ id, settingsSchema: z.object({}) } as never) : undefined,
  },
};

const context: LearnerPreparationContext = {
  capabilities,
  authoringSchema: schema,
  expectedRequiresScaffoldPlus: false,
  productAccess: { scaffoldPlusAuthorized: false },
};

afterEach(() => vi.unstubAllGlobals());

describe("prepareLearnerContent", () => {
  it("returns the checked canonical document and portable learner payload without mutating input", () => {
    const document = documentWith({
      type: "known_block",
      attrs: { id: "knownblock01", data: { count: 1 } },
    });
    const before = structuredClone(document);

    const result = prepareLearnerContent(document, context);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw new Error("expected learner preparation to succeed");
    expect(result.value.canonicalDocument).toEqual(document);
    expect(result.value.learnerContent).toEqual(document);
    expect(result.value.assessmentTargets).toEqual([]);
    expect(result.value.assessmentGroups).toEqual([]);
    expect(document).toEqual(before);
  });

  it("retains invalid issue codes, messages, and paths", () => {
    const result = prepareLearnerContent(
      documentWith({
        type: "known_block",
        attrs: { id: "knownblock01", data: { count: "bad" } },
      }),
      context,
    );

    expectFailure(result, "invalid");
    if (result.isOk() || result.error.reason !== "invalid") return;
    expect(result.error.issues[0]).toEqual(
      expect.objectContaining({
        code: "invalid_capability_attrs",
        message: expect.any(String),
        path: expect.any(Array),
      }),
    );
  });

  it("retains Plus, future-format, and unavailable capability facts", () => {
    const plus = documentWith(knownBlock());
    courseAttrs(plus).requiresScaffoldPlus = true;
    expectFailure(
      prepareLearnerContent(plus, { ...context, expectedRequiresScaffoldPlus: true }),
      "requires-scaffold-plus",
    );

    const future = documentWith(knownBlock());
    courseAttrs(future).schemaVersion = SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1;
    const futureResult = prepareLearnerContent(future, context);
    expectFailure(futureResult, "unsupported-core-format");
    if (futureResult.isErr() && futureResult.error.reason === "unsupported-core-format") {
      expect(futureResult.error).toEqual({
        reason: "unsupported-core-format",
        documentVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1,
        supportedVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        message: expect.any(String),
      });
    }

    const established = establishAuthoringDocument({
      canonicalDocument: documentWith({
        type: "missing_block",
        attrs: { id: "missingblk01" },
      }),
      capabilities,
      authoringSchema: schema,
      productAccess: context.productAccess,
    });
    if (established.status !== "unavailable") {
      throw new Error("expected unavailable preparation fixture");
    }
    const unavailable = prepareLearnerContent(
      ScaffoldDocumentContentSchema.parse(established.workingDocument),
      context,
    );
    expectFailure(unavailable, "unavailable-content");
    if (unavailable.isErr() && unavailable.error.reason === "unavailable-content") {
      expect(unavailable.error.unavailableContent).toEqual([
        {
          kind: "block",
          capabilityId: "missing_block",
          stableId: "missingblk01",
          path: expect.any(Array),
        },
      ]);
    }
  });

  it("retains the complete projection warning array", () => {
    const result = prepareLearnerContent(
      documentWith({
        type: "quiz",
        attrs: { id: "quiz00000001", settings: {} },
        content: [knownBlock()],
      }),
      context,
    );

    expectFailure(result, "projection-warning");
    if (result.isOk() || result.error.reason !== "projection-warning") return;
    expect(result.error.warnings).toEqual([
      {
        code: "invalid-assessment-group",
        blockType: "quiz",
        blockId: "quiz00000001",
        surfaceId: "surface00001",
        message: expect.any(String),
      },
    ]);
  });

  it("returns the oversized payload part, measured bytes, and current limit", () => {
    const result = prepareLearnerContent(
      documentWith({
        type: "paragraph",
        attrs: { id: "paragraph001" },
        content: [
          { type: "text", text: "x".repeat(ARTIFACT_SAVE_PAYLOAD_LIMITS.learnerContentBytes) },
        ],
      }),
      context,
    );

    expectFailure(result, "payload-too-large");
    if (result.isOk() || result.error.reason !== "payload-too-large") return;
    expect(result.error.part).toBe("learner-content");
    expect(result.error.measuredBytes).toBeGreaterThan(result.error.limitBytes);
    expect(result.error.limitBytes).toBe(ARTIFACT_SAVE_PAYLOAD_LIMITS.learnerContentBytes);
  });

  it("does not read host/editor capabilities and leaves unexpected defects observable", () => {
    const guardedContext = Object.defineProperties(
      { ...context },
      {
        editor: {
          get: () => {
            throw new Error("editor side effect");
          },
        },
        publish: {
          get: () => {
            throw new Error("host write");
          },
        },
        save: {
          get: () => {
            throw new Error("host write");
          },
        },
      },
    ) as LearnerPreparationContext;
    const document = documentWith(knownBlock());
    expect(prepareLearnerContent(document, guardedContext).isOk()).toBe(true);

    const defect = new Error("TextEncoder invariant failed");
    vi.stubGlobal(
      "TextEncoder",
      class {
        constructor() {
          throw defect;
        }
      },
    );
    expect(() => prepareLearnerContent(document, context)).toThrow(defect);
  });
});

function knownBlock() {
  return { type: "known_block", attrs: { id: "knownblock01", data: { count: 1 } } };
}

function documentWith(block: Record<string, unknown>) {
  return ScaffoldDocumentContentSchema.parse({
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: "course000001",
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          requiresScaffoldPlus: false,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
          theme: createDefaultPersistedCourseTheme(),
        },
        content: [
          {
            type: "surface",
            attrs: { id: "surface00001", variant: "known-surface", settings: {} },
            content: [block],
          },
        ],
      },
    ],
  });
}

function courseAttrs(document: ReturnType<typeof documentWith>): Record<string, unknown> {
  return (document.content as Array<{ attrs: Record<string, unknown> }>)[0]!.attrs;
}

function expectFailure(
  result: ReturnType<typeof prepareLearnerContent>,
  reason: LearnerContentPreparationError["reason"],
): void {
  expect(result.isErr()).toBe(true);
  if (result.isOk()) throw new Error(`expected ${reason} preparation failure`);
  expect(result.error.reason).toBe(reason);
}
