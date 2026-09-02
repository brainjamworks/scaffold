import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  LearnerInteractionConfigurationV1Schema,
  ScaffoldDocumentContentSchema,
  type LearnerInteractionRuleV1,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { Result } from "better-result";
import { describe, expect, it } from "vite-plus/test";

import type {
  ControlCapabilityCatalogue,
  ResolvedControlTarget,
} from "@/document/control-binding/control-capability-catalogue";
import { projectCourseStructure } from "@/document/model/course-structure";
import type { SemanticDocumentSnapshot, SemanticItem } from "@/document/model/semantic-document";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { checkLearnerInteractionPublication } from "./learner-interaction-publication";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");
const RULE_ID = EmbeddedDataIdSchema.parse("rule00000001");

describe("checkLearnerInteractionPublication", () => {
  it("is ready without compilation for Page and unconfigured Slideshow documents", () => {
    for (const mode of ["page", "slideshow"] as const) {
      const document = createDocument(mode);
      expect(check(document)).toEqual({ status: "ready", compilation: null });
    }
  });

  it("returns the compiler output for valid portable rules", () => {
    const document = createDocument("slideshow", [validRule()]);

    const result = check(document);

    expect(result.status).toBe("ready");
    if (result.status !== "ready" || result.compilation === null) {
      throw new Error("Expected a compiled publication result.");
    }
    expect(result.compilation.diagnostics).toEqual([]);
    expect(result.compilation.surfaceById.get(SURFACE_ID)?.surfaceId).toBe(SURFACE_ID);
  });

  it.each([
    { label: "one invalid rule", rules: [invalidRule(RULE_ID, true, "missing")] },
    {
      label: "multiple invalid rules",
      rules: [
        invalidRule(RULE_ID, true, "first-missing"),
        invalidRule(EmbeddedDataIdSchema.parse("rule00000002"), true, "second-missing"),
      ],
    },
    { label: "a disabled invalid rule", rules: [invalidRule(RULE_ID, false, "missing")] },
  ])("returns every compiler diagnostic for $label", ({ rules }) => {
    const result = check(createDocument("slideshow", rules));

    expect(result.status).toBe("diagnostic");
    if (result.status !== "diagnostic") throw new Error("Expected diagnostics.");
    expect(result.diagnostics).toHaveLength(rules.length);
    expect(result.diagnostics.map(({ reason }) => reason)).toEqual(
      rules.map(() => "event-not-declared"),
    );
  });

  it("does not convert compiler invariant failures into publication diagnostics", () => {
    const document = createDocument("slideshow", [validRule()]);
    const courseDocument = (document as JSONContent).content?.[0];
    if (!courseDocument?.attrs) throw new Error("Expected Course Document attributes.");
    courseDocument.attrs["learnerInteractions"] = LearnerInteractionConfigurationV1Schema.parse({
      schemaVersion: 1,
      surfaces: [{ surfaceId: "surface00002", rules: [validRule()] }],
    });

    expect(() => check(document)).toThrow(
      'Learner Interaction Surface group "surface00002" is not in Course Structure.',
    );
  });
});

function check(document: ReturnType<typeof createDocument>) {
  const courseStructure = projectCourseStructure(document);
  if (!courseStructure) throw new Error("Expected a valid Course Structure fixture.");
  return checkLearnerInteractionPublication({
    document,
    courseStructure,
    semanticSnapshot: semanticSnapshot(courseStructure.mode),
    controlCapabilities: controlCapabilities(),
  });
}

function createDocument(mode: "page" | "slideshow", rules?: readonly LearnerInteractionRuleV1[]) {
  const document =
    mode === "slideshow"
      ? createScaffoldDocumentContent({
          mode,
          surfaceId: SURFACE_ID,
          initialCourseSectionTitle: "Section",
        })
      : createScaffoldDocumentContent({ mode, surfaceId: SURFACE_ID });
  const courseDocument = document.content?.[0];
  if (!courseDocument?.attrs) throw new Error("Expected Course Document attributes.");
  if (rules) {
    courseDocument.attrs["learnerInteractions"] = LearnerInteractionConfigurationV1Schema.parse({
      schemaVersion: 1,
      surfaces: [{ surfaceId: SURFACE_ID, rules }],
    });
  }
  return ScaffoldDocumentContentSchema.parse(document);
}

function validRule(): LearnerInteractionRuleV1 {
  return {
    id: RULE_ID,
    isEnabled: true,
    when: { targetId: TARGET_ID, type: "activated" },
    conditions: [],
    commands: [{ kind: "reveal-target", targetId: TARGET_ID }],
  };
}

function invalidRule(
  id: LearnerInteractionRuleV1["id"],
  isEnabled: boolean,
  type: string,
): LearnerInteractionRuleV1 {
  return { ...validRule(), id, isEnabled, when: { targetId: TARGET_ID, type } };
}

function semanticSnapshot(mode: "page" | "slideshow"): SemanticDocumentSnapshot {
  const surface = semanticItem(SURFACE_ID, "surface");
  const target = semanticItem(TARGET_ID, "published-child");
  return {
    revision: 1,
    mode,
    roots: [surface],
    itemById: new Map([
      [SURFACE_ID, surface],
      [TARGET_ID, target],
    ]),
    parentById: new Map([
      [SURFACE_ID, null],
      [TARGET_ID, SURFACE_ID],
    ]),
    locationById: new Map([
      [SURFACE_ID, location(SURFACE_ID, "surface")],
      [TARGET_ID, location(TARGET_ID, "paragraph")],
    ]),
    diagnostics: [],
  };
}

function semanticItem(id: typeof SURFACE_ID, kind: SemanticItem["kind"]): SemanticItem {
  return {
    id,
    kind,
    nodeType: kind,
    definitionId: kind === "surface" ? "slide-content" : null,
    label: id,
    summary: null,
    presentation: { actionIds: [], disabledReason: null },
    presentationContainer: null,
    children: [],
  };
}

function location(id: typeof SURFACE_ID, nodeType: string) {
  return {
    id,
    nodeType,
    from: 0,
    to: 1,
    selectionTarget: { kind: "node" as const, pos: 0 },
    surfaceId: SURFACE_ID,
    authoringAnchorId: null,
    activationPath: [],
  };
}

function controlCapabilities(): ControlCapabilityCatalogue {
  const target: ResolvedControlTarget = {
    targetId: TARGET_ID,
    ownerId: TARGET_ID,
    capabilities: { events: [{ type: "activated", label: "Activated" }] },
  };
  return {
    resolve: (targetId) =>
      targetId === TARGET_ID
        ? Result.ok(target)
        : Result.err({ reason: "target-not-public" as const, targetId }),
    resolveCommand: (targetId, type) =>
      Result.err({ reason: "command-not-declared" as const, targetId, type }),
    requireOwnerControlDefinition: () => {
      throw new Error("Not used by publication check.");
    },
    requireOwnedTargetCapabilities: () => {
      throw new Error("Not used by publication check.");
    },
  };
}
