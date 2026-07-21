// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { AssessmentChoicesGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { McqNode } from "@/editor/blocks/assessment/mcq/node";
import { QuizNode } from "@/editor/blocks/assessment/quiz/node";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";
import { ScaffoldRichTextDocumentSchema, EmptyScaffoldRichTextDocument } from "@/schemas/rich-text";
import { ImageBlockAttrsSchema } from "@scaffold/contracts";
import "@/editor/blocks/assessment/quiz/quiz-definition";
import {
  SelectableChoiceBodyNode,
  SelectableChoiceNode,
} from "@/editor/blocks/assessment/shared/nodes/selectable-choice";
import { defineConfiguration } from "@/editor/configuration/definition";
import type {
  NodeSettingsSheetDefinition,
  SettingsSheetApplyInput,
} from "@/editor/configuration/settings-sheet";

import {
  applySettingsSheetSettings,
  ConfigurationSettingsSheet,
  parseSettingsSheetDraft,
  resolveSettingsTargetTitle,
} from "./ConfigurationSettingsSheet";

afterEach(() => {
  testNodeSettingsSheetDefinition = undefined;
  cleanup();
});

let testNodeSettingsSheetDefinition: NodeSettingsSheetDefinition | undefined;

function makeEditor(initialSettings: unknown = {}) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentChoicesGroupNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      SelectableChoiceBodyNode,
      SelectableChoiceNode,
      McqNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "mcq",
          attrs: { id: "block-mcq", settings: initialSettings },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "assessment_choices_group",
              content: [
                {
                  type: "selectable_choice",
                  attrs: { id: "a", isCorrect: false },
                  content: [
                    {
                      type: "selectable_choice_body",
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "assessment_actions_group",
              content: [
                { type: "assessment_hints_group" },
                { type: "assessment_summary_feedback" },
              ],
            },
          ],
        },
      ],
    },
  });
  // Top-level mcq node sits at position 0 in the doc.
  return { editor, mcqPos: 0 };
}

function readMcqSettings(editor: Editor): Record<string, unknown> {
  const mcq = editor.getJSON().content?.[0] as JSONContent | undefined;
  return (mcq?.attrs?.["settings"] as Record<string, unknown>) ?? {};
}

function createSettingsTarget(editor: Editor) {
  return createAuthoringNodeTarget(editor, { id: "block-mcq", nodeType: "mcq" });
}

function readFirstMcqSettings(editor: Editor): Record<string, unknown> {
  let settings: Record<string, unknown> | null = null;
  editor.state.doc.descendants((node) => {
    if (settings === null && node.type.name === "mcq") {
      settings = node.attrs["settings"] as Record<string, unknown>;
      return false;
    }
    return true;
  });
  return settings ?? {};
}

const schema = z.object({
  legend: z.string().optional(),
  points: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive().nullable(),
});

const configurationSheetSchema = z.object({
  showAnswer: z.boolean().default(true),
  points: z.number().int().nonnegative().default(1),
});

const TestConfigurationSheetNode = Node.create({
  name: "test_configuration_sheet_block",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      id: {
        default: null,
      },
      settings: {
        default: configurationSheetSchema.parse({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-test-configuration-sheet-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        "data-test-configuration-sheet-block": "",
      },
    ];
  },
});

const collectionOwnerDataSchema = z.object({
  title: z.string(),
  caption: ScaffoldRichTextDocumentSchema,
});

const collectionItemDataSchema = z.object({
  image: ImageBlockAttrsSchema.nullable(),
  caption: ScaffoldRichTextDocumentSchema,
});

const TestCollectionSettingsOwnerNode = Node.create({
  name: "test_collection_settings_owner",
  group: "block",
  content: "test_collection_settings_item*",
  addAttributes() {
    return { id: { default: null }, data: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-test-collection-settings-owner]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-test-collection-settings-owner": "" }, 0];
  },
});

const TestCollectionSettingsItemNode = Node.create({
  name: "test_collection_settings_item",
  group: "block",
  atom: true,
  addAttributes() {
    return { id: { default: null }, data: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-test-collection-settings-item]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-test-collection-settings-item": "" }];
  },
});

function registerTestSettingsSheet(createInitialDraft?: () => unknown) {
  testNodeSettingsSheetDefinition = {
    nodeType: "mcq",
    attr: "settings",
    schema,
    ...(createInitialDraft ? { createInitialDraft } : {}),
    title: "Test settings sheet",
    defaultOpenSections: ["scoring"],
    sections: [
      {
        id: "scoring",
        title: "Scoring",
        description: "Set how this question contributes to results.",
        fields: [
          {
            kind: "number",
            name: "points",
            label: "Points",
            min: 0,
            step: 1,
            integer: true,
          },
        ],
      },
      {
        id: "attempts",
        title: "Attempts",
        fields: [
          {
            kind: "number",
            name: "maxAttempts",
            label: "Max attempts",
            min: 1,
            step: 1,
            integer: true,
            emptyValue: null,
          },
        ],
      },
    ],
  };
  return testNodeSettingsSheetDefinition;
}

const configurationSheetEntry = defineBlock({
  nodeType: "test_configuration_sheet_block",
  configuration: defineConfiguration({
    attr: "settings",
    schema: configurationSheetSchema,
    sheet: {
      title: "Configuration settings",
      defaultOpenSections: ["behaviour"],
      sections: [{ id: "behaviour", title: "Behaviour" }],
    },
    controls: [
      {
        kind: "boolean",
        name: "showAnswer",
        label: "Show answer",
        placement: {
          quickMenu: { presentation: "icon-toggle" },
          sheet: { section: "behaviour" },
        },
      },
      {
        kind: "number",
        name: "points",
        label: "Points",
        min: 0,
        step: 1,
        integer: true,
        placement: {
          sheet: { section: "behaviour" },
        },
      },
    ],
  }),
}).settingsSheet;

function makeConfigurationSheetEditor(initialSettings: unknown = {}) {
  const editor = new Editor({
    extensions: [StarterKit.configure({ undoRedo: false }), TestConfigurationSheetNode],
    content: {
      type: "doc",
      content: [
        {
          type: "test_configuration_sheet_block",
          attrs: { id: "block-configuration", settings: initialSettings },
        },
      ],
    },
  });
  return { editor, blockPos: 0 };
}

function readConfigurationSheetSettings(editor: Editor): Record<string, unknown> {
  const block = editor.getJSON().content?.[0] as JSONContent | undefined;
  return (block?.attrs?.["settings"] as Record<string, unknown>) ?? {};
}

function renderSettingsSheet(
  editor: Editor,
  pos: number,
  onOpenChange = vi.fn(),
  entry = testNodeSettingsSheetDefinition,
) {
  render(
    createElement(ConfigurationSettingsSheet, {
      editor,
      nodeType: "mcq",
      ...(entry ? { entry } : {}),
      pos,
      targetId: "block-mcq",
      open: true,
      onOpenChange,
    }),
  );

  return { onOpenChange };
}

function registerQuizManagedSettingsSheet() {
  testNodeSettingsSheetDefinition = {
    nodeType: "mcq",
    attr: "settings",
    schema: z.object({
      feedbackMode: z.enum(["immediate", "on_submit"]).default("immediate"),
      showAnswer: z.boolean().default(true),
      maxAttempts: z.number().int().positive().nullable().default(null),
      isGraded: z.boolean().default(true),
      points: z.number().int().nonnegative().default(1),
      legend: z.string().default("Question response"),
    }),
    title: "Quiz child settings",
    defaultOpenSections: ["behaviour", "scoring", "presentation"],
    sections: [
      {
        id: "behaviour",
        title: "Behaviour",
        fields: [
          {
            kind: "select",
            name: "feedbackMode",
            label: "Feedback mode",
            options: [
              { value: "immediate", label: "Immediate" },
              { value: "on_submit", label: "On submit" },
            ],
          },
          {
            kind: "boolean",
            name: "showAnswer",
            label: "Show answer",
          },
          {
            kind: "number",
            name: "maxAttempts",
            label: "Max attempts",
            min: 1,
            step: 1,
            integer: true,
            emptyValue: null,
          },
          {
            kind: "boolean",
            name: "isGraded",
            label: "Graded",
          },
        ],
      },
      {
        id: "scoring",
        title: "Scoring",
        fields: [
          {
            kind: "number",
            name: "points",
            label: "Points",
            min: 0,
            step: 1,
            integer: true,
          },
        ],
      },
      {
        id: "presentation",
        title: "Presentation",
        fields: [
          {
            kind: "text",
            name: "legend",
            label: "Accessible response label",
          },
        ],
      },
    ],
  };
  return testNodeSettingsSheetDefinition;
}

function makeQuizChildEditor(initialSettings: unknown = {}) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentChoicesGroupNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      SelectableChoiceBodyNode,
      SelectableChoiceNode,
      McqNode,
      QuizNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "quiz",
          attrs: { id: "quiz-1" },
          content: [
            {
              type: "mcq",
              attrs: { id: "block-mcq", settings: initialSettings },
              content: [
                { type: "assessment_title", content: [{ type: "paragraph" }] },
                {
                  type: "assessment_instructions",
                  content: [{ type: "paragraph" }],
                },
                { type: "assessment_prompt", content: [{ type: "paragraph" }] },
                {
                  type: "assessment_choices_group",
                  content: [
                    {
                      type: "selectable_choice",
                      attrs: { id: "a", isCorrect: false },
                      content: [
                        {
                          type: "selectable_choice_body",
                          content: [{ type: "paragraph" }],
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "assessment_actions_group",
                  content: [
                    { type: "assessment_hints_group" },
                    { type: "assessment_summary_feedback" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  return { editor, mcqPos: findNodePos(editor, "mcq") };
}

function findNodePos(editor: Editor, nodeType: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found === null && node.type.name === nodeType) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found === null) throw new Error(`expected ${nodeType} node`);
  return found;
}

describe("ConfigurationSettingsSheet", () => {
  it.each([
    ["chart_block", "Chart"],
    ["image_block", "Image"],
    ["audio_block", "Audio"],
  ])("resolves divergent node type %s through its insert title", (nodeType, title) => {
    expect(resolveSettingsTargetTitle(nodeType)).toBe(title);
  });

  it("marks quiz-managed assessment child controls while leaving per-question controls editable", async () => {
    registerQuizManagedSettingsSheet();
    const before = {
      feedbackMode: "immediate",
      showAnswer: true,
      maxAttempts: 2,
      isGraded: true,
      points: 1,
      legend: "Question response",
    };
    const { editor, mcqPos } = makeQuizChildEditor(before);
    renderSettingsSheet(editor, mcqPos);

    expect(screen.queryAllByText("Managed by quiz").length).toBeGreaterThan(0);
    const maxAttempts = screen.queryByLabelText("Max attempts") as HTMLInputElement | null;
    const showAnswer = screen.queryByRole("checkbox", {
      name: "Show answer",
    }) as HTMLButtonElement | null;
    const graded = screen.queryByRole("checkbox", {
      name: "Graded",
    }) as HTMLButtonElement | null;
    const required = screen.queryByRole("checkbox", { name: "Required" });
    const points = screen.queryByLabelText("Points") as HTMLInputElement | null;
    const legend = screen.queryByLabelText("Accessible response label") as HTMLInputElement | null;

    expect(Boolean(maxAttempts)).toBe(true);
    expect(maxAttempts?.disabled).toBe(true);
    expect(Boolean(showAnswer)).toBe(true);
    expect(showAnswer?.disabled).toBe(true);
    expect(Boolean(graded)).toBe(true);
    expect(graded?.disabled).toBe(true);
    expect(required).toBeNull();
    expect(Boolean(points)).toBe(true);
    expect(points?.disabled).toBe(false);
    expect(Boolean(legend)).toBe(true);
    expect(legend?.disabled).toBe(false);

    await userEvent.clear(points!);
    await userEvent.type(points!, "4");
    await userEvent.clear(legend!);
    await userEvent.type(legend!, "Updated response label");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const after = readFirstMcqSettings(editor);
    expect(after["feedbackMode"]).toBe(before.feedbackMode);
    expect(after["showAnswer"]).toBe(before.showAnswer);
    expect(after["maxAttempts"]).toBe(before.maxAttempts);
    expect(after["isGraded"]).toBe(before.isGraded);
    expect(after["points"]).toBe(4);
    expect(after["legend"]).toBe("Updated response label");
    expect(Object.prototype.hasOwnProperty.call(after, "inQuiz")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(after, "disabledByQuiz")).toBe(false);
    editor.destroy();
  });

  it("renders only the managed reason for quiz-managed fields", () => {
    registerQuizManagedSettingsSheet();
    expect(
      builtInBlockRegistry.getByNodeType("quiz")?.childSettings?.managedFields?.[0]?.hints,
    ).toBeUndefined();
    const { editor, mcqPos } = makeQuizChildEditor({
      feedbackMode: "on_submit",
      showAnswer: true,
      maxAttempts: 2,
      isGraded: true,
      points: 1,
      legend: "Question response",
    });
    renderSettingsSheet(editor, mcqPos);

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("Managed by quiz");
    expect(bodyText).not.toContain(
      "Choose whether learners see feedback while they answer or only after they submit. Managed by quiz",
    );
    expect(bodyText).not.toContain(
      "Include this question in scoring and reported results. Managed by quiz",
    );
    expect(bodyText).not.toContain(
      "Allow learners to reveal the correct answer when this question permits review. Managed by quiz",
    );
    expect(bodyText).not.toContain("Leave blank to allow unlimited attempts. Managed by quiz");
    expect(bodyText).not.toContain("Quiz review timing controls when feedback appears.");
    expect(bodyText).not.toContain(
      "Quiz review detail controls whether correct answers are shown.",
    );
    expect(bodyText).not.toContain("Quiz attempts per question controls retries.");
    expect(bodyText).not.toContain("Quiz scoring controls whether this question counts.");
    expect(bodyText).not.toContain("RequiredManaged by quiz");

    editor.destroy();
  });

  it("keeps the same assessment child controls editable outside quiz", () => {
    registerQuizManagedSettingsSheet();
    const { editor, mcqPos } = makeEditor({
      feedbackMode: "immediate",
      showAnswer: true,
      maxAttempts: 2,
      isGraded: true,
      points: 1,
    });
    renderSettingsSheet(editor, mcqPos);

    expect(screen.queryByText("Managed by quiz")).toBeNull();
    const maxAttempts = screen.queryByLabelText("Max attempts") as HTMLInputElement | null;
    const showAnswer = screen.queryByRole("checkbox", {
      name: "Show answer",
    }) as HTMLButtonElement | null;
    const graded = screen.queryByRole("checkbox", {
      name: "Graded",
    }) as HTMLButtonElement | null;

    expect(Boolean(maxAttempts)).toBe(true);
    expect(maxAttempts?.disabled).toBe(false);
    expect(Boolean(showAnswer)).toBe(true);
    expect(showAnswer?.disabled).toBe(false);
    expect(Boolean(graded)).toBe(true);
    expect(graded?.disabled).toBe(false);
    editor.destroy();
  });

  it("writes configuration settings before restoring launcher focus", async () => {
    const { editor, blockPos } = makeConfigurationSheetEditor({
      showAnswer: true,
      points: 1,
    });
    let focusedWhenClosed: Element | null = null;
    const onOpenChange = vi.fn((nextOpen: boolean) => {
      if (!nextOpen) focusedWhenClosed = document.activeElement;
    });

    render(createElement("button", { type: "button" }, "Open block settings"));
    const launcher = screen.getByRole("button", { name: "Open block settings" });
    launcher.focus();

    render(
      createElement(ConfigurationSettingsSheet, {
        editor,
        entry: configurationSheetEntry!,
        nodeType: "test_configuration_sheet_block",
        pos: blockPos,
        targetId: "block-configuration",
        open: true,
        onOpenChange,
      }),
    );

    expect(screen.getByText("Configuration settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Behaviour" })).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Points"));
    await userEvent.type(screen.getByLabelText("Points"), "6");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(readConfigurationSheetSettings(editor)).toMatchObject({
      showAnswer: true,
      points: 6,
    });
    expect(readConfigurationSheetSettings(editor).quick).toBeUndefined();
    expect(document.activeElement).toBe(launcher);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(focusedWhenClosed).toBe(launcher);
    editor.destroy();
  });

  it("renders native sections and saves edited settings", async () => {
    registerTestSettingsSheet();
    const { editor, mcqPos } = makeEditor({
      legend: "Old",
      points: 1,
      maxAttempts: 2,
    });
    const { onOpenChange } = renderSettingsSheet(editor, mcqPos);

    expect(screen.getByText("Test settings sheet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scoring" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attempts" })).toBeInTheDocument();
    const scoringRegion = screen.getByRole("region", { name: "Scoring" });
    expect(scoringRegion.getAttribute("aria-describedby")).toBe(
      "settings-section-scoring-description",
    );
    expect(document.getElementById("settings-section-scoring-description")?.textContent).toBe(
      "Set how this question contributes to results.",
    );

    await userEvent.clear(screen.getByLabelText("Points"));
    await userEvent.type(screen.getByLabelText("Points"), "5");
    const paragraph = editor.state.schema.nodes["paragraph"]?.create();
    if (!paragraph) throw new Error("Expected the paragraph node type");
    editor.view.dispatch(editor.state.tr.insert(0, paragraph));
    expect((screen.getByLabelText("Points") as HTMLInputElement).value).toBe("5");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(readFirstMcqSettings(editor)).toMatchObject({
      legend: "Old",
      points: 5,
      maxAttempts: 2,
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    editor.destroy();
  });

  it("blocks invalid saves and keeps persisted settings unchanged", async () => {
    registerTestSettingsSheet();
    const before = { legend: "Old", points: 1, maxAttempts: 2 };
    const { editor, mcqPos } = makeEditor(before);
    renderSettingsSheet(editor, mcqPos);

    await userEvent.clear(screen.getByLabelText("Points"));
    await userEvent.type(screen.getByLabelText("Points"), "-1");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.getAllByRole("alert").some((alert) => /points/i.test(alert.textContent ?? "")),
    ).toBe(true);
    expect(readMcqSettings(editor)).toMatchObject(before);
    editor.destroy();
  });

  it("loads an initial draft for empty persisted settings attrs", async () => {
    registerTestSettingsSheet(() => ({
      legend: "Generated",
      points: 1,
      maxAttempts: null,
    }));
    const { editor, mcqPos } = makeEditor(null);
    renderSettingsSheet(editor, mcqPos);

    expect((screen.getByLabelText("Points") as HTMLInputElement).value).toBe("1");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(readMcqSettings(editor)).toMatchObject({
      legend: "Generated",
      points: 1,
      maxAttempts: null,
    });
    editor.destroy();
  });

  it("parses transformed persisted attrs when the sheet owns a draft shape", () => {
    const draftSchema = z.object({
      title: z.string(),
      table: z.object({
        headers: z.array(z.string()),
        rows: z.array(z.array(z.string())),
      }),
    });

    const result = parseSettingsSheetDraft(
      draftSchema,
      {
        title: "Votes",
        data: {
          columns: [{ label: "Fruit" }, { label: "Votes" }],
          rows: [{ cells: ["Apples", "12"] }],
        },
      },
      undefined,
      (raw) => {
        const persisted = raw as {
          title: string;
          data: {
            columns: Array<{ label: string }>;
            rows: Array<{ cells: string[] }>;
          };
        };
        return {
          title: persisted.title,
          table: {
            headers: persisted.data.columns.map((column) => column.label),
            rows: persisted.data.rows.map((row) => row.cells),
          },
        };
      },
    );

    expect(result).toEqual({
      ok: true,
      data: {
        title: "Votes",
        table: {
          headers: ["Fruit", "Votes"],
          rows: [["Apples", "12"]],
        },
      },
    });
  });

  it("cancels without writing draft changes", async () => {
    registerTestSettingsSheet();
    const before = { legend: "Old", points: 1, maxAttempts: 2 };
    const { editor, mcqPos } = makeEditor(before);
    const { onOpenChange } = renderSettingsSheet(editor, mcqPos);

    await userEvent.clear(screen.getByLabelText("Points"));
    await userEvent.type(screen.getByLabelText("Points"), "8");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(readMcqSettings(editor)).toMatchObject(before);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    editor.destroy();
  });

  it("shows an error state for invalid persisted settings", () => {
    registerTestSettingsSheet();
    const { editor, mcqPos } = makeEditor({
      legend: "Old",
      points: "invalid",
      maxAttempts: 2,
    });

    renderSettingsSheet(editor, mcqPos);

    expect(screen.getByRole("alert").textContent).toMatch(/settings/i);
    expect(screen.queryByLabelText("Points")).toBeNull();
    editor.destroy();
  });
});

describe("applySettingsSheetSettings", () => {
  it("writes the parsed values back to the node when validation passes", () => {
    const { editor } = makeEditor({
      legend: "Old",
      points: 1,
      maxAttempts: null,
    });
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const result = applySettingsSheetSettings({
      schema,
      attr: "settings",
      target: createSettingsTarget(editor),
      values: { legend: "New", points: 5, maxAttempts: 3 },
    });

    expect(result).toEqual({ ok: true });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(readMcqSettings(editor)).toMatchObject({
      legend: "New",
      points: 5,
      maxAttempts: 3,
    });
    editor.destroy();
  });

  it("returns an error and does NOT mutate the node when validation fails", () => {
    const before = { legend: "Untouched", points: 1, maxAttempts: null };
    const { editor } = makeEditor(before);

    const result = applySettingsSheetSettings({
      schema,
      attr: "settings",
      target: createSettingsTarget(editor),
      // points must be a non-negative integer — string fails.
      values: { legend: "New", points: "not a number", maxAttempts: 3 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/points/i);
    }
    expect(readMcqSettings(editor)).toMatchObject(before);
    editor.destroy();
  });

  it("coerces partial input through schema defaults before writing", () => {
    const { editor } = makeEditor({});

    const schemaWithDefaults = z.object({
      legend: z.string().default(""),
      points: z.number().default(1),
      maxAttempts: z.number().nullable().default(null),
    });

    const result = applySettingsSheetSettings({
      schema: schemaWithDefaults,
      attr: "settings",
      target: createSettingsTarget(editor),
      values: { points: 7 },
    });

    expect(result).toEqual({ ok: true });
    expect(readMcqSettings(editor)).toMatchObject({
      legend: "",
      points: 7,
      maxAttempts: null,
    });
    editor.destroy();
  });

  it("delegates submitted settings to a custom apply hook when one is provided", () => {
    const before = { legend: "Untouched", points: 1, maxAttempts: null };
    const { editor } = makeEditor(before);
    const apply = vi.fn(({ tr, target }: SettingsSheetApplyInput) => ({
      ok: true as const,
      tr: tr.setNodeMarkup(target.pos, undefined, {
        ...target.node.attrs,
        settings: { legend: "Applied", points: 9, maxAttempts: null },
      }),
    }));
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const result = applySettingsSheetSettings({
      schema,
      attr: "settings",
      target: createSettingsTarget(editor),
      values: { legend: "New", points: 5, maxAttempts: 3 },
      apply,
    });

    expect(result).toEqual({ ok: true });
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        attr: "settings",
        schema,
        value: { legend: "New", points: 5, maxAttempts: 3 },
        target: expect.objectContaining({ pos: 0 }),
      }),
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(readMcqSettings(editor)).toMatchObject({ legend: "Applied", points: 9 });
    editor.destroy();
  });

  it("lets custom apply hooks own validation and persistence semantics", () => {
    const before = { legend: "Untouched", points: 1, maxAttempts: null };
    const { editor } = makeEditor(before);
    const apply = vi.fn(({ tr }: SettingsSheetApplyInput) => ({
      ok: true as const,
      tr,
    }));

    const result = applySettingsSheetSettings({
      schema,
      attr: "settings",
      target: createSettingsTarget(editor),
      values: { legend: "New", points: "not a number", maxAttempts: 3 },
      apply,
    });

    expect(result).toEqual({ ok: true });
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        attr: "settings",
        schema,
        value: { legend: "New", points: "not a number", maxAttempts: 3 },
      }),
    );
    expect(readMcqSettings(editor)).toMatchObject(before);
    editor.destroy();
  });

  it("does not dispatch when the live settings target is missing or invalid", () => {
    const missingEditor = makeConfigurationSheetEditor({ points: 1 }).editor;
    const missingTarget = createAuthoringNodeTarget(missingEditor, {
      id: "block-configuration",
      nodeType: "test_configuration_sheet_block",
    });
    missingEditor.view.dispatch(
      missingEditor.state.tr.delete(0, missingEditor.state.doc.content.size),
    );
    const missingDispatch = vi.spyOn(missingEditor.view, "dispatch");

    expect(
      applySettingsSheetSettings({
        schema: configurationSheetSchema,
        attr: "settings",
        target: missingTarget,
        values: { showAnswer: true, points: 2 },
      }),
    ).toEqual({
      ok: false,
      error: "The authoring target no longer exists.",
    });
    expect(missingDispatch).not.toHaveBeenCalled();
    missingEditor.destroy();

    const invalidEditor = new Editor({
      extensions: [StarterKit.configure({ undoRedo: false }), TestConfigurationSheetNode],
      content: {
        type: "doc",
        content: [
          {
            type: "test_configuration_sheet_block",
            attrs: { id: "duplicate", settings: { showAnswer: true, points: 1 } },
          },
          {
            type: "test_configuration_sheet_block",
            attrs: { id: "duplicate", settings: { showAnswer: true, points: 1 } },
          },
        ],
      },
    });
    const invalidDispatch = vi.spyOn(invalidEditor.view, "dispatch");

    expect(
      applySettingsSheetSettings({
        schema: configurationSheetSchema,
        attr: "settings",
        target: createAuthoringNodeTarget(invalidEditor, {
          id: "duplicate",
          nodeType: "test_configuration_sheet_block",
        }),
        values: { showAnswer: true, points: 2 },
      }),
    ).toEqual({
      ok: false,
      error: "The authoring target identity is invalid.",
    });
    expect(invalidDispatch).not.toHaveBeenCalled();
    invalidEditor.destroy();
  });

  it("renders declared child collections and preserves newer live rich text on Save", async () => {
    const externalCaption = {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [{ type: "text", text: "External caption" }] }],
    };
    const editor = new Editor({
      extensions: [StarterKit, TestCollectionSettingsOwnerNode, TestCollectionSettingsItemNode],
      content: {
        type: "doc",
        content: [
          {
            type: "test_collection_settings_owner",
            attrs: {
              id: "collection-owner",
              data: { title: "Original", caption: EmptyScaffoldRichTextDocument },
            },
            content: [
              {
                type: "test_collection_settings_item",
                attrs: {
                  id: "collection-item-a",
                  data: {
                    image: null,
                    caption: EmptyScaffoldRichTextDocument,
                  },
                },
              },
            ],
          },
        ],
      },
    });
    const entry: NodeSettingsSheetDefinition = {
      nodeType: "test_collection_settings_owner",
      attr: "data",
      schema: collectionOwnerDataSchema,
      title: "Collection settings",
      defaultOpenSections: ["content"],
      sections: [
        {
          id: "content",
          title: "Content",
          fields: [
            { kind: "text", name: "title", label: "Title" },
            {
              kind: "richText",
              name: "caption",
              label: "Shared caption",
              placeholder: "Add a shared caption",
            },
          ],
          collections: [
            {
              id: "images",
              childNodeType: "test_collection_settings_item",
              attr: "data",
              schema: collectionItemDataSchema,
              initialValue: {
                image: null,
                caption: EmptyScaffoldRichTextDocument,
              },
              itemLabel: "Image",
              addLabel: "Add image",
              referenceStyle: "lower-alpha",
              fields: [
                {
                  kind: "image",
                  name: "image",
                  label: "Image file",
                  mediaStorage: "canonical",
                },
              ],
            },
          ],
        },
      ],
    };

    render(
      createElement(ConfigurationSettingsSheet, {
        editor,
        nodeType: "test_collection_settings_owner",
        entry,
        pos: 0,
        targetId: "collection-owner",
        open: true,
        onOpenChange: vi.fn(),
      }),
    );

    expect(await screen.findByRole("group", { name: "Image (a)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add image" })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("textbox", { name: "Title" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Draft title");

    const current = editor.state.doc.nodeAt(0)?.attrs["data"] as Record<string, unknown>;
    editor.view.dispatch(
      editor.state.tr.setNodeAttribute(0, "data", { ...current, caption: externalCaption }),
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Shared caption" }).textContent).toBe(
        "External caption",
      );
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(editor.state.doc.nodeAt(0)?.attrs["data"]).toEqual({
      title: "Draft title",
      caption: externalCaption,
    });
    editor.destroy();
  });
});
