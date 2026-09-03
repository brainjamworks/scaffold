// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { categoriseConfiguration } from "@/editor/blocks/assessment/categorise/categorise-definition";
import { dropdownConfiguration } from "@/editor/blocks/assessment/dropdown/dropdown-definition";
import { dragDropConfiguration } from "@/editor/blocks/assessment/drag-drop/drag-drop-definition";
import { fillBlanksConfiguration } from "@/editor/blocks/assessment/fill-blanks/fill-blanks-definition";
import { imageHotspotConfiguration } from "@/editor/blocks/assessment/image-hotspot/image-hotspot-definition";
import { matchingConfiguration } from "@/editor/blocks/assessment/matching/matching-definition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { resolveStableNode } from "@/document/model/identity/resolve-stable-node";
import { mcqConfiguration } from "@/editor/blocks/assessment/mcq/mcq-definition";
import { multiselectConfiguration } from "@/editor/blocks/assessment/multiselect/multiselect-definition";
import { sequencingConfiguration } from "@/editor/blocks/assessment/sequencing/sequencing-definition";
import {
  applyConfigurationDraft,
  readConfigurationDraft,
  type ConfigurationAccessDefinition,
} from "@/editor/configuration/configuration-access";
import type { ConfigurationDefinition } from "@/editor/configuration/definition";
import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";
import { builtInSurfaceAuthoringViewMap } from "@/editor/surfaces/authoring/surface-authoring-views";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import type { RegisteredSurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";

import { defineAssessmentSurfaceConfiguration } from "./assessment-surface-configuration";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const QUESTION_ID = EmbeddedNodeIdSchema.parse("target000001");

const REGISTERED_ASSESSMENT_CONFIGURATIONS = [
  {
    variantId: "slide-categorise-question",
    questionConfiguration: categoriseConfiguration,
  },
  {
    variantId: "slide-sequencing-question",
    questionConfiguration: sequencingConfiguration,
  },
  {
    variantId: "slide-matching-question",
    questionConfiguration: matchingConfiguration,
  },
  {
    variantId: "slide-image-hotspot-question",
    questionConfiguration: imageHotspotConfiguration,
  },
  {
    variantId: "slide-multiple-choice-question",
    questionConfiguration: mcqConfiguration,
  },
  {
    variantId: "slide-multiselect-question",
    questionConfiguration: multiselectConfiguration,
  },
  {
    variantId: "slide-dropdown-question",
    questionConfiguration: dropdownConfiguration,
  },
  {
    variantId: "slide-drag-drop-question",
    questionConfiguration: dragDropConfiguration,
  },
  {
    variantId: "slide-fill-blanks-question",
    questionConfiguration: fillBlanksConfiguration,
  },
] as const;

describe("assessment Surface configuration", () => {
  it("mechanically projects question controls and adds only Header and Footer controls", () => {
    const configuration = defineTracerConfiguration(
      "slide-multiple-choice-question",
      mcqConfiguration,
    );

    expect(configuration.controls.slice(0, mcqConfiguration.controls.length)).toEqual(
      mcqConfiguration.controls.map((control) => ({
        ...control,
        name: `question.${control.name}`,
      })),
    );
    expect(
      configuration.controls.slice(mcqConfiguration.controls.length).map(({ name }) => name),
    ).toEqual(["surface.header.enabled", "surface.footer.enabled"]);
    expect(configuration.controls.some(({ name }) => name.includes("background"))).toBe(false);
    expect(configuration.sheet?.sections.map(({ title }) => title)).not.toContain("Background");
    expect(configuration.collections).toBeUndefined();

    const configurationWithDependency = defineTracerConfiguration(
      "slide-multiple-choice-question",
      {
        ...mcqConfiguration,
        controls: mcqConfiguration.controls.map((control, index) =>
          index === 0 ? { ...control, visibleWhen: { name: "isGraded", equals: true } } : control,
        ),
      },
    );
    expect(configurationWithDependency.controls[0]?.visibleWhen?.name).toBe("question.isGraded");
  });

  it("applies Surface-only quick-menu placement without changing sheet placement", () => {
    const configuration = defineAssessmentSurfaceConfiguration({
      surfaceDefinition: requireSurfaceDefinition("slide-multiple-choice-question"),
      questionConfiguration: mcqConfiguration,
      questionQuickMenuPlacements: {
        points: { order: 10 },
        isGraded: { presentation: "icon-toggle", order: 20 },
      },
    });

    expect(
      configuration.controls
        .filter((control) => control.placement?.quickMenu)
        .map((control) => ({ name: control.name, placement: control.placement })),
    ).toEqual([
      {
        name: "question.feedbackMode",
        placement: {
          quickMenu: { presentation: "segmented" },
          sheet: { section: "behaviour" },
        },
      },
      {
        name: "question.isGraded",
        placement: {
          quickMenu: { presentation: "icon-toggle", order: 20 },
          sheet: { section: "behaviour" },
        },
      },
      {
        name: "question.showAnswer",
        placement: {
          quickMenu: { presentation: "icon-toggle" },
          sheet: { section: "behaviour" },
        },
      },
      {
        name: "question.points",
        placement: {
          quickMenu: { order: 10 },
          sheet: { section: "scoring" },
        },
      },
    ]);
  });

  it("throws when a Surface quick-menu placement names no canonical question control", () => {
    expect(() =>
      defineAssessmentSurfaceConfiguration({
        surfaceDefinition: requireSurfaceDefinition("slide-multiple-choice-question"),
        questionConfiguration: mcqConfiguration,
        questionQuickMenuPlacements: { unknown: { order: 10 } },
      }),
    ).toThrow(
      'Assessment Surface "slide-multiple-choice-question" cannot place unknown question control "unknown".',
    );
  });

  it.each(REGISTERED_ASSESSMENT_CONFIGURATIONS)(
    "reads and applies the registered $variantId configuration through its fixed question child",
    ({ questionConfiguration, variantId }) => {
      const configuration = requireRegisteredConfiguration(variantId);
      const editor = createEditor(variantId, {
        background: { color: "#123456" },
        retainedSurfaceSetting: "keep-me",
      });
      const dispatch = vi.spyOn(editor.view, "dispatch");

      try {
        expect(configuration.title).toBe(questionConfiguration.sheet?.title);
        const draft = readDraft(editor, configuration);
        const questionDraft = draft.question as Record<string, unknown>;
        expect(questionDraft).toEqual(
          questionConfiguration.schema.parse(question(editor).attrs?.["settings"]),
        );

        const result = transactDraft(editor, configuration, {
          question: {
            ...questionDraft,
            isGraded: !questionDraft["isGraded"],
          },
          surface: {
            header: { enabled: true },
            footer: { enabled: false },
          },
        });

        expect(result.ok).toBe(true);
        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(question(editor).attrs?.["settings"]).toMatchObject({
          isGraded: !questionDraft["isGraded"],
        });
        expect(surface(editor).attrs?.["settings"]).toEqual({
          background: { color: "#123456" },
          retainedSurfaceSetting: "keep-me",
          header: { enabled: true },
          footer: { enabled: false },
        });
      } finally {
        editor.destroy();
      }
    },
  );

  it("reads the question and Surface branches with and without optional region nodes", () => {
    const configuration = defineTracerConfiguration(
      "slide-multiple-choice-question",
      mcqConfiguration,
    );
    const editor = createEditor("slide-multiple-choice-question", {
      background: { color: "#123456" },
      retainedSurfaceSetting: "keep-me",
    });

    try {
      expect(readDraft(editor, configuration)).toMatchObject({
        question: { legend: "Choose one answer" },
        surface: {
          header: { enabled: false },
          footer: { enabled: false },
        },
      });

      const result = transactDraft(editor, configuration, {
        ...readDraft(editor, configuration),
        surface: {
          header: { enabled: true },
          footer: { enabled: true },
        },
      });
      expect(result.ok).toBe(true);
      expect(surface(editor).content?.map(({ type }) => type)).toEqual([
        "surface_header",
        "surface_multiple_choice_question",
        "surface_footer",
      ]);
      expect(readDraft(editor, configuration)).toMatchObject({
        surface: {
          header: { enabled: true },
          footer: { enabled: true },
        },
      });
    } finally {
      editor.destroy();
    }
  });

  it("updates an ordinary question and regions atomically while preserving other Surface settings", () => {
    const configuration = defineTracerConfiguration(
      "slide-multiple-choice-question",
      mcqConfiguration,
    );
    const editor = createEditor("slide-multiple-choice-question", {
      background: { color: "#123456" },
      retainedSurfaceSetting: "keep-me",
    });
    const dispatch = vi.spyOn(editor.view, "dispatch");

    try {
      const draft = readDraft(editor, configuration);
      const result = transactDraft(editor, configuration, {
        question: {
          ...(draft.question as Record<string, unknown>),
          feedbackMode: "immediate",
          points: 7,
        },
        surface: {
          header: { enabled: true },
          footer: { enabled: false },
        },
      });

      expect(result.ok).toBe(true);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(question(editor).attrs?.["settings"]).toMatchObject({
        feedbackMode: "immediate",
        points: 7,
      });
      expect(surface(editor).attrs?.["settings"]).toEqual({
        background: { color: "#123456" },
        retainedSurfaceSetting: "keep-me",
        header: { enabled: true },
        footer: { enabled: false },
      });
    } finally {
      editor.destroy();
    }
  });

  it("delegates Multi-select question persistence to its custom apply hook", () => {
    const delegatedApply = vi.fn(multiselectConfiguration.apply);
    const configuration = defineTracerConfiguration("slide-multiselect-question", {
      ...multiselectConfiguration,
      apply: delegatedApply,
    });
    const editor = createEditor("slide-multiselect-question");

    try {
      const draft = readDraft(editor, configuration);
      const result = transactDraft(editor, configuration, {
        ...draft,
        question: {
          ...(draft.question as Record<string, unknown>),
          maxSelect: 3,
        },
      });

      expect(result.ok).toBe(true);
      expect(delegatedApply).toHaveBeenCalledTimes(1);
      expect(question(editor).attrs?.["settings"]).toMatchObject({ maxSelect: 3 });
    } finally {
      editor.destroy();
    }
  });

  it("throws for an incorrectly registered owner or malformed fixed structure", () => {
    const configuration = defineTracerConfiguration(
      "slide-multiple-choice-question",
      mcqConfiguration,
    );
    const wrongVariantEditor = createEditor("slide-multiselect-question");
    const malformedEditor = createEditor(
      "slide-multiple-choice-question",
      undefined,
      "slide-multiselect-question",
    );

    try {
      expect(() => readDraft(wrongVariantEditor, configuration)).toThrow(
        'Assessment Surface configuration for "slide-multiple-choice-question" cannot read "slide-multiselect-question".',
      );
      expect(() => readDraft(malformedEditor, configuration)).toThrow(
        'Assessment Surface "slide-multiple-choice-question" has malformed fixed content.',
      );
    } finally {
      wrongVariantEditor.destroy();
      malformedEditor.destroy();
    }
  });

  it("returns a checked refusal without dispatching or partially mutating", () => {
    const configuration = defineTracerConfiguration(
      "slide-multiple-choice-question",
      mcqConfiguration,
    );
    const editor = createEditor("slide-multiple-choice-question");
    const before = editor.getJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    try {
      const result = transactDraft(editor, configuration, {
        question: { points: "not-a-number" },
        surface: {
          header: { enabled: true },
          footer: { enabled: true },
        },
      });

      expect(result).toMatchObject({
        ok: false,
        issue: { code: "invalid_assessment_surface_configuration" },
      });
      expect(dispatch).not.toHaveBeenCalled();
      expect(editor.getJSON()).toEqual(before);
    } finally {
      editor.destroy();
    }
  });

  it.each([
    {
      expectedIssue: {
        code: "missing_node",
        message: `Assessment Surface "${SURFACE_ID}" was not found.`,
      },
      mutation: "missing" as const,
    },
    {
      expectedIssue: {
        code: "duplicate_node_id",
        message: `Assessment Surface id "${SURFACE_ID}" is duplicated.`,
      },
      mutation: "duplicate" as const,
    },
    {
      expectedIssue: {
        code: "wrong_node_type",
        message: `Node "${SURFACE_ID}" is not a Surface.`,
      },
      mutation: "wrong-type" as const,
    },
  ])(
    "returns the $expectedIssue.code checked refusal without dispatch when delegated apply changes the owner",
    ({ expectedIssue, mutation }) => {
      const configuration = defineTracerConfiguration("slide-multiple-choice-question", {
        ...mcqConfiguration,
        apply: ({ tr }) => {
          mutateSurfaceOwnerResolution(tr, mutation);
          return { ok: true, tr };
        },
      });
      const editor = createEditor("slide-multiple-choice-question");
      const before = editor.getJSON();
      const dispatch = vi.spyOn(editor.view, "dispatch");

      try {
        const result = transactDraft(editor, configuration, readDraft(editor, configuration));

        expect(result).toEqual({ ok: false, issue: expectedIssue });
        expect(dispatch).not.toHaveBeenCalled();
        expect(editor.getJSON()).toEqual(before);
      } finally {
        editor.destroy();
      }
    },
  );
});

function requireRegisteredConfiguration(variantId: string) {
  const configuration = builtInSurfaceAuthoringViewMap.get(variantId)?.settingsSheet;
  if (!configuration) throw new Error(`Expected registered configuration for "${variantId}".`);
  return configuration;
}

function defineTracerConfiguration(
  variantId: string,
  questionConfiguration: ConfigurationDefinition,
): ConfigurationDefinition {
  return defineAssessmentSurfaceConfiguration({
    surfaceDefinition: requireSurfaceDefinition(variantId),
    questionConfiguration,
  });
}

function requireSurfaceDefinition(variantId: string): RegisteredSurfaceVariantDefinition {
  const definition = builtInSurfaceVariantRegistry.get(variantId);
  if (!definition) throw new Error(`Expected Surface definition "${variantId}".`);
  return definition;
}

function createEditor(
  variantId: string,
  surfaceSettings?: Record<string, unknown>,
  childVariantId = variantId,
): Editor {
  const definition = requireSurfaceDefinition(variantId);
  const childDefinition = requireSurfaceDefinition(childVariantId);
  const createdSurface = definition.createSurface({ surfaceId: SURFACE_ID });
  const createdChild = childDefinition.createSurface({ surfaceId: SURFACE_ID }).content?.[0];
  if (!createdChild) throw new Error(`Expected Surface "${childVariantId}" to create a child.`);

  return new Editor({
    extensions: createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: createCoreScaffoldAuthoringComposition(),
    }),
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "slideshow" },
          content: [
            { type: "courseSection", attrs: { id: createEmbeddedNodeId(), title: "Intro" } },
            {
              ...createdSurface,
              attrs: {
                ...createdSurface.attrs,
                ...(surfaceSettings ? { settings: surfaceSettings } : {}),
              },
              content: [
                {
                  ...createdChild,
                  attrs: { ...createdChild.attrs, id: QUESTION_ID },
                },
              ],
            },
          ],
        },
      ],
    },
  });
}

function readDraft(
  editor: Editor,
  configuration: ConfigurationAccessDefinition,
): { question: unknown; surface: unknown } {
  const target = surfaceTarget(editor).read();
  if (!target) throw new Error("Expected a live Surface target.");
  return readConfigurationDraft({ definition: configuration, target }) as {
    question: unknown;
    surface: unknown;
  };
}

function transactDraft(
  editor: Editor,
  configuration: ConfigurationAccessDefinition,
  value: unknown,
) {
  return surfaceTarget(editor).transact((tr, target) =>
    applyConfigurationDraft({ definition: configuration, tr, target, value }),
  );
}

function mutateSurfaceOwnerResolution(
  tr: Transaction,
  mutation: "missing" | "duplicate" | "wrong-type",
): void {
  const currentSurface = resolveStableNode(tr.doc, { id: SURFACE_ID, nodeType: "surface" });
  if (currentSurface.status !== "ready") throw new Error("Expected a current Surface owner.");

  if (mutation === "missing") {
    tr.delete(currentSurface.pos, currentSurface.pos + currentSurface.node.nodeSize);
    return;
  }

  let section: { node: typeof currentSurface.node; pos: number } | undefined;
  tr.doc.descendants((node, pos) => {
    if (node.type.name !== "courseSection") return true;
    section = { node, pos };
    return false;
  });
  if (!section) throw new Error("Expected a Course Section sibling.");
  tr.setNodeMarkup(section.pos, undefined, { ...section.node.attrs, id: SURFACE_ID });

  if (mutation === "wrong-type") {
    tr.delete(currentSurface.pos, currentSurface.pos + currentSurface.node.nodeSize);
  }
}

function surfaceTarget(editor: Editor) {
  return createAuthoringNodeTarget(editor, { id: SURFACE_ID, nodeType: "surface" });
}

function surface(editor: Editor): JSONContent {
  const found = editor.getJSON().content?.[0]?.content?.find((child) => child.type === "surface");
  if (!found) throw new Error("Expected a Surface node.");
  return found;
}

function question(editor: Editor): JSONContent {
  const found = surface(editor).content?.find((child) => child.type?.includes("question"));
  if (!found) throw new Error("Expected an assessment question child.");
  return found;
}
