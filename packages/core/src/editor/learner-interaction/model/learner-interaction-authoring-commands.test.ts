// @vitest-environment jsdom

import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type LearnerInteractionConfigurationV1,
  type LearnerInteractionRuleV1,
} from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { slideMultipleChoiceQuestionSurfaceDefinition } from "@/editor/surfaces/model/templates/assessment/slide-multiple-choice-question";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";

import {
  removeLearnerInteractionRule,
  reorderLearnerInteractionRule,
  saveLearnerInteractionRule,
  setLearnerInteractionRuleEnabled,
} from "./learner-interaction-authoring-commands";
import type { LearnerInteractionRuleDraft } from "./learner-interaction-rule-draft";

const IDS = Object.freeze({
  section: EmbeddedNodeIdSchema.parse("section00001"),
  firstSurface: EmbeddedNodeIdSchema.parse("surface00001"),
  secondSurface: EmbeddedNodeIdSchema.parse("surface00002"),
  missingSurface: EmbeddedNodeIdSchema.parse("surface99999"),
  firstRule: EmbeddedDataIdSchema.parse("rule00000001"),
  secondRule: EmbeddedDataIdSchema.parse("rule00000002"),
  otherRule: EmbeddedDataIdSchema.parse("rule00000003"),
  missingRule: EmbeddedDataIdSchema.parse("rule99999999"),
});

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    if (!editor.isDestroyed) editor.destroy();
  }
});

describe("learner interaction authoring commands", () => {
  it("creates the sparse root and one complete rule in one checked transaction", () => {
    const editor = createEditor();
    const changedTransactions = trackChangedTransactions(editor);

    const result = saveLearnerInteractionRule({
      editor,
      surfaceId: IDS.firstSurface,
      draft: validDraft(null),
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(changedTransactions()).toBe(1);
    expect(result.value).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(readConfiguration(editor)).toEqual({
      schemaVersion: 1,
      surfaces: [
        {
          surfaceId: IDS.firstSurface,
          rules: [savedRule(result.value, validDraft(null))],
        },
      ],
    });
  });

  it("updates a complete rule atomically while preserving its identity", () => {
    const editor = createEditor({
      learnerInteractions: configuration([
        { surfaceId: IDS.firstSurface, rules: [rule(IDS.firstRule, true)] },
      ]),
    });
    const changedTransactions = trackChangedTransactions(editor);

    const result = saveLearnerInteractionRule({
      editor,
      surfaceId: IDS.firstSurface,
      draft: { ...validDraft(IDS.firstRule), isEnabled: false },
    });

    expect(result.isOk() && result.value).toBe(IDS.firstRule);
    expect(changedTransactions()).toBe(1);
    expect(readConfiguration(editor)?.surfaces[0]?.rules).toEqual([
      savedRule(IDS.firstRule, { ...validDraft(IDS.firstRule), isEnabled: false }),
    ]);
  });

  it("enables, reorders and removes saved rules without requiring them to compile", () => {
    const broken = rule(IDS.firstRule, true, "removed-event");
    const editor = createEditor({
      learnerInteractions: configuration([
        { surfaceId: IDS.firstSurface, rules: [broken, rule(IDS.secondRule, true)] },
      ]),
    });
    const changedTransactions = trackChangedTransactions(editor);

    expect(
      setLearnerInteractionRuleEnabled({
        editor,
        surfaceId: IDS.firstSurface,
        ruleId: IDS.firstRule,
        isEnabled: false,
      }).isOk(),
    ).toBe(true);
    expect(
      reorderLearnerInteractionRule({
        editor,
        surfaceId: IDS.firstSurface,
        ruleId: IDS.secondRule,
        direction: "earlier",
      }).isOk(),
    ).toBe(true);
    expect(
      removeLearnerInteractionRule({
        editor,
        surfaceId: IDS.firstSurface,
        ruleId: IDS.firstRule,
      }).isOk(),
    ).toBe(true);

    expect(changedTransactions()).toBe(3);
    expect(readConfiguration(editor)?.surfaces[0]?.rules).toEqual([rule(IDS.secondRule, true)]);
  });

  it("removes empty groups and then the sparse root", () => {
    const editor = createEditor({
      learnerInteractions: configuration([
        { surfaceId: IDS.firstSurface, rules: [rule(IDS.firstRule, true)] },
        { surfaceId: IDS.secondSurface, rules: [rule(IDS.otherRule, true, "selected")] },
      ]),
    });

    expect(
      removeLearnerInteractionRule({
        editor,
        surfaceId: IDS.firstSurface,
        ruleId: IDS.firstRule,
      }).isOk(),
    ).toBe(true);
    expect(readConfiguration(editor)?.surfaces.map(({ surfaceId }) => surfaceId)).toEqual([
      IDS.secondSurface,
    ]);
    expect(
      removeLearnerInteractionRule({
        editor,
        surfaceId: IDS.secondSurface,
        ruleId: IDS.otherRule,
      }).isOk(),
    ).toBe(true);
    expect(readConfiguration(editor)).toBeNull();
  });

  it("returns editor-destroyed and leaves the document unchanged", () => {
    const editor = createEditor();
    const before = editor.getJSON();
    editor.destroy();

    const result = saveLearnerInteractionRule({
      editor,
      surfaceId: IDS.firstSurface,
      draft: validDraft(null),
    });

    expect(result.isErr() && result.error).toEqual({ reason: "editor-destroyed" });
    expect(editor.getJSON()).toEqual(before);
  });

  it("returns editor-read-only and leaves the document unchanged", () => {
    const editor = createEditor({ editable: false });
    expectFailurePreserves(
      editor,
      () =>
        saveLearnerInteractionRule({
          editor,
          surfaceId: IDS.firstSurface,
          draft: validDraft(null),
        }),
      { reason: "editor-read-only" },
    );
  });

  it("returns surface-not-current with every current Surface and no mutation", () => {
    const editor = createEditor();
    expectFailurePreserves(
      editor,
      () =>
        saveLearnerInteractionRule({
          editor,
          surfaceId: IDS.missingSurface,
          draft: validDraft(null),
        }),
      {
        reason: "surface-not-current",
        surfaceId: IDS.missingSurface,
        currentSurfaceIds: [IDS.firstSurface, IDS.secondSurface],
      },
    );
  });

  it("returns invalid-rule-draft with every concrete structural diagnostic", () => {
    const editor = createEditor();
    expectFailurePreserves(
      editor,
      () =>
        saveLearnerInteractionRule({
          editor,
          surfaceId: IDS.firstSurface,
          draft: {
            ruleId: null,
            isEnabled: true,
            when: null,
            conditions: [],
            commands: [],
          },
        }),
      {
        reason: "invalid-rule-draft",
        diagnostics: [{ reason: "when-required" }, { reason: "then-required" }],
      },
    );
  });

  it("returns rule-not-current when the rule identity is absent", () => {
    const editor = createEditor({
      learnerInteractions: configuration([
        { surfaceId: IDS.firstSurface, rules: [rule(IDS.firstRule, true)] },
      ]),
    });
    expectFailurePreserves(
      editor,
      () =>
        setLearnerInteractionRuleEnabled({
          editor,
          surfaceId: IDS.firstSurface,
          ruleId: IDS.missingRule,
          isEnabled: false,
        }),
      { reason: "rule-not-current", surfaceId: IDS.firstSurface, ruleId: IDS.missingRule },
    );
  });

  it("returns rule-belongs-to-another-surface with the actual owner", () => {
    const editor = createEditor({
      learnerInteractions: configuration([
        { surfaceId: IDS.secondSurface, rules: [rule(IDS.otherRule, true, "selected")] },
      ]),
    });
    expectFailurePreserves(
      editor,
      () =>
        removeLearnerInteractionRule({
          editor,
          surfaceId: IDS.firstSurface,
          ruleId: IDS.otherRule,
        }),
      {
        reason: "rule-belongs-to-another-surface",
        surfaceId: IDS.firstSurface,
        actualSurfaceId: IDS.secondSurface,
        ruleId: IDS.otherRule,
      },
    );
  });

  it("returns only candidate rule diagnostics when an unrelated sibling is also stale", () => {
    const editor = createEditor({
      learnerInteractions: configuration([
        {
          surfaceId: IDS.firstSurface,
          rules: [rule(IDS.firstRule, true, "removed-sibling")],
        },
      ]),
    });
    const draft = {
      ...validDraft(null),
      when: { targetId: IDS.firstSurface, type: "removed-event" },
    };

    const result = expectFailurePreserves(
      editor,
      () => saveLearnerInteractionRule({ editor, surfaceId: IDS.firstSurface, draft }),
      expect.objectContaining({
        reason: "rule-unresolved",
        surfaceId: IDS.firstSurface,
        diagnostics: [
          expect.objectContaining({
            reason: "event-not-declared",
            type: "removed-event",
          }),
        ],
      }),
    );

    expect(result.error).toMatchObject({ ruleId: expect.any(String) });
    expect(result.error.diagnostics).toHaveLength(1);
  });

  it("lets a clean candidate save beside an unrelated stale sibling", () => {
    const editor = createEditor({
      learnerInteractions: configuration([
        {
          surfaceId: IDS.firstSurface,
          rules: [rule(IDS.firstRule, true, "removed-sibling")],
        },
      ]),
    });

    const result = saveLearnerInteractionRule({
      editor,
      surfaceId: IDS.firstSurface,
      draft: validDraft(null),
    });

    expect(result.isOk()).toBe(true);
    expect(readConfiguration(editor)?.surfaces[0]?.rules).toHaveLength(2);
  });

  it("returns rule-reorder-boundary with the requested direction", () => {
    const editor = createEditor({
      learnerInteractions: configuration([
        { surfaceId: IDS.firstSurface, rules: [rule(IDS.firstRule, true)] },
      ]),
    });
    expectFailurePreserves(
      editor,
      () =>
        reorderLearnerInteractionRule({
          editor,
          surfaceId: IDS.firstSurface,
          ruleId: IDS.firstRule,
          direction: "earlier",
        }),
      {
        reason: "rule-reorder-boundary",
        surfaceId: IDS.firstSurface,
        ruleId: IDS.firstRule,
        direction: "earlier",
      },
    );
  });

  it("throws malformed established roots and duplicate identities", () => {
    const malformed = createEditor({
      learnerInteractions: { schemaVersion: 2 } as unknown as LearnerInteractionConfigurationV1,
    });
    expect(() =>
      setLearnerInteractionRuleEnabled({
        editor: malformed,
        surfaceId: IDS.firstSurface,
        ruleId: IDS.firstRule,
        isEnabled: false,
      }),
    ).toThrow();

    const duplicated = createEditor({
      learnerInteractions: {
        schemaVersion: 1,
        surfaces: [
          {
            surfaceId: IDS.firstSurface,
            rules: [rule(IDS.firstRule, true), rule(IDS.firstRule, false)],
          },
        ],
      },
    });
    expect(() =>
      removeLearnerInteractionRule({
        editor: duplicated,
        surfaceId: IDS.firstSurface,
        ruleId: IDS.firstRule,
      }),
    ).toThrow();
  });

  it("keeps an invalid Course Document and dispatch defects observable", () => {
    const page = createEditor({ mode: "page" });
    expect(() =>
      saveLearnerInteractionRule({
        editor: page,
        surfaceId: IDS.firstSurface,
        draft: validDraft(null),
      }),
    ).toThrow("valid Slideshow Course Document");

    const editor = createEditor();
    const dispatchDefect = new Error("dispatch invariant");
    const dispatch = editor.view.dispatch;
    editor.view.dispatch = () => {
      throw dispatchDefect;
    };
    try {
      expect(() =>
        saveLearnerInteractionRule({
          editor,
          surfaceId: IDS.firstSurface,
          draft: validDraft(null),
        }),
      ).toThrow(dispatchDefect);
    } finally {
      editor.view.dispatch = dispatch;
    }
  });
});

function validDraft(ruleId: LearnerInteractionRuleDraft["ruleId"]): LearnerInteractionRuleDraft {
  return {
    ruleId,
    isEnabled: true,
    when: { targetId: IDS.firstSurface, type: "evaluated" },
    conditions: [
      {
        targetId: IDS.firstSurface,
        key: "phase",
        operator: "equals",
        value: "evaluated",
      },
    ],
    commands: [
      { kind: "reveal-target", targetId: IDS.firstSurface },
      { kind: "navigate-surface", surfaceId: IDS.secondSurface },
    ],
  };
}

function rule(
  id: LearnerInteractionRuleV1["id"],
  isEnabled: boolean,
  eventType = "evaluated",
): LearnerInteractionRuleV1 {
  return {
    id,
    isEnabled,
    when: {
      targetId: eventType === "selected" ? IDS.secondSurface : IDS.firstSurface,
      type: eventType,
    },
    conditions: [],
    commands: [
      {
        kind: "reveal-target",
        targetId: eventType === "selected" ? IDS.secondSurface : IDS.firstSurface,
      },
    ],
  };
}

function savedRule(
  id: LearnerInteractionRuleV1["id"],
  draft: LearnerInteractionRuleDraft,
): LearnerInteractionRuleV1 {
  if (!draft.when || draft.commands.length === 0) throw new Error("Expected complete draft.");
  return {
    id,
    isEnabled: draft.isEnabled,
    when: draft.when,
    conditions: [...draft.conditions],
    commands: [...draft.commands] as LearnerInteractionRuleV1["commands"],
  };
}

function configuration(
  surfaces: LearnerInteractionConfigurationV1["surfaces"],
): LearnerInteractionConfigurationV1 {
  return { schemaVersion: 1, surfaces };
}

function createEditor({
  editable = true,
  learnerInteractions = null,
  mode = "slideshow",
}: {
  readonly editable?: boolean;
  readonly learnerInteractions?: LearnerInteractionConfigurationV1 | null;
  readonly mode?: "page" | "slideshow";
} = {}): Editor {
  const composition = createCoreScaffoldAuthoringComposition();
  const editor = new Editor({
    editable,
    extensions: createCourseDocumentAuthoringExtensions({ editable, composition }),
    content: courseDocument(mode, learnerInteractions),
  });
  editors.push(editor);
  return editor;
}

function courseDocument(
  mode: "page" | "slideshow",
  learnerInteractions: LearnerInteractionConfigurationV1 | null,
): JSONContent {
  const first = slideMultipleChoiceQuestionSurfaceDefinition.createSurface({
    surfaceId: IDS.firstSurface,
  });
  const second = slideContentSurfaceDefinition.createSurface({ surfaceId: IDS.secondSurface });
  assignMissingNodeIds(first);
  assignMissingNodeIds(second);
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode, learnerInteractions },
        content:
          mode === "slideshow"
            ? [
                { type: "courseSection", attrs: { id: IDS.section, title: "Interactions" } },
                first,
                second,
              ]
            : [first],
      },
    ],
  };
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

function readConfiguration(editor: Editor): LearnerInteractionConfigurationV1 | null {
  const value = editor.getJSON().content?.[0]?.attrs?.["learnerInteractions"];
  return (value ?? null) as LearnerInteractionConfigurationV1 | null;
}

function trackChangedTransactions(editor: Editor): () => number {
  let count = 0;
  editor.on("transaction", ({ transaction }) => {
    if (transaction.docChanged) count += 1;
  });
  return () => count;
}

function expectFailurePreserves(
  editor: Editor,
  run: () => ReturnType<typeof saveLearnerInteractionRule>,
  expected: unknown,
) {
  const before = editor.getJSON();
  const changedTransactions = trackChangedTransactions(editor);
  const result = run();
  expect(result.isErr()).toBe(true);
  if (result.isOk()) throw new Error("Expected authoring command failure.");
  expect(result.error).toEqual(expected);
  expect(changedTransactions()).toBe(0);
  expect(editor.getJSON()).toEqual(before);
  return result;
}
