// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Extension, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";

import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createCourseStructureCommandsExtension } from "@/document/authoring/course-structure-commands";
import type { CourseStructureCommand } from "@/document/model/course-structure";
import { CategoriseAuthoringExtension } from "@/editor/blocks/assessment/categorise/categorise-authoring-extension";
import { SequencingAuthoringExtension } from "@/editor/blocks/assessment/sequencing/sequencing-authoring-extension";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import {
  ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { ExtendedHeading } from "@/editor/rich-text/model/rich-text-blocks";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { SlideTitleNode } from "@/editor/surfaces/model/nodes/slide-title";
import { SurfaceCategoriseQuestionNode } from "@/editor/surfaces/model/assessment/surface-categorise-question-node";
import { SurfaceSequencingQuestionNode } from "@/editor/surfaces/model/assessment/surface-sequencing-question-node";
import { builtInSurfaceVariantDefinitions } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import type { SurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { authoringSlideDividersPluginKey } from "./AuthoringSlideDividers";
import { AuthoringSlideDividers } from "./AuthoringSlideDividers";
import { SurfaceTemplatePicker } from "./SurfaceTemplatePickerHost";
import { createSurfaceCreationCatalog } from "./surface-creation-catalog";
import { insertSurfaceTemplateAfterSurface } from "./surface-template-insertion";

const surfaceVariants = createSurfaceVariantRegistry(builtInSurfaceVariantDefinitions);
const CONTRIBUTED_REGION_ID = EmbeddedNodeIdSchema.parse("contribreg01");
const contributedSurfaceDefinition: SurfaceVariantDefinition = {
  id: "contributed-identity-test",
  modes: ["slideshow"],
  title: "Contributed identity test",
  description: "A contributed Surface used to verify atomic template identity.",
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "contributed-identity-test" },
    content: [
      {
        type: "region",
        attrs: { id: CONTRIBUTED_REGION_ID, role: "main" },
        content: [{ type: "paragraph" }],
      },
    ],
  }),
};
const surfaceVariantsWithContribution = createSurfaceVariantRegistry([
  ...builtInSurfaceVariantDefinitions,
  contributedSurfaceDefinition,
]);
const coreCapabilities = createCoreScaffoldAuthoringComposition().capabilities;
const testCapabilities = Object.freeze({
  blocks: coreCapabilities.blocks,
  documentTree: coreCapabilities.documentTree,
  layouts: coreCapabilities.layouts,
  surfaces: Object.freeze({ registry: surfaceVariants }),
});
const FIRST_SURFACE_ID = createEmbeddedNodeId();
const SECOND_SURFACE_ID = createEmbeddedNodeId();
const THIRD_SURFACE_ID = createEmbeddedNodeId();
const FIRST_SECTION_ID = createEmbeddedNodeId();
const SECOND_SECTION_ID = createEmbeddedNodeId();

const editors: Editor[] = [];
const editorElements: HTMLElement[] = [];

const TestArrangementNode = Node.create({
  name: "testArrangement",
  group: ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

const TestSectionArrangementNode = Node.create({
  name: "testSectionArrangement",
  group: SECTION_ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const editor of editors.splice(0)) editor.destroy();
  for (const element of editorElements.splice(0)) element.remove();
  vi.restoreAllMocks();
});

describe("SurfaceTemplatePickerHost", () => {
  it("organises layouts by category around one selected preview", async () => {
    const { dialog, user } = await renderOpenPicker();
    expect(
      within(dialog).getByText("Choose a layout for the slide you want to add."),
    ).toBeInTheDocument();
    const titleTab = within(dialog).getByRole("tab", { name: "Title layouts" });
    const contentTab = within(dialog).getByRole("tab", { name: "Content layouts" });
    const imageTab = within(dialog).getByRole("tab", { name: "Image layouts" });
    const assessmentTab = within(dialog).getByRole("tab", { name: "Assessment slides" });

    expect(titleTab).toHaveAttribute("aria-selected", "true");
    expect(contentTab).toHaveAttribute("aria-selected", "false");
    expect(imageTab).toHaveAttribute("aria-selected", "false");
    expect(assessmentTab).toHaveAttribute("aria-selected", "false");

    const titleChoices = within(dialog).getByRole("radiogroup", { name: "Title layouts" });
    expect(within(titleChoices).getAllByRole("radio")).toEqual([
      within(titleChoices).getByRole("radio", { name: "Cover" }),
      within(titleChoices).getByRole("radio", { name: "Module cover" }),
      within(titleChoices).getByRole("radio", { name: "Image cover" }),
      within(titleChoices).getByRole("radio", { name: "Image band" }),
    ]);
    expect(within(titleChoices).getByRole("radio", { name: "Cover" })).toBeChecked();
    expect(within(dialog).getByRole("heading", { name: "Cover", level: 2 })).toBeInTheDocument();
    expect(
      within(dialog).getByText("Opening slide with a title and short description."),
    ).toBeInTheDocument();

    await user.click(contentTab);

    expect(contentTab).toHaveAttribute("aria-selected", "true");
    const contentChoices = within(dialog).getByRole("radiogroup", { name: "Content layouts" });
    expect(within(contentChoices).getAllByRole("radio")).toEqual([
      within(contentChoices).getByRole("radio", { name: "Content" }),
      within(contentChoices).getByRole("radio", { name: "Two columns" }),
      within(contentChoices).getByRole("radio", { name: "Three columns" }),
      within(contentChoices).getByRole("radio", { name: "Two stacked" }),
      within(contentChoices).getByRole("radio", { name: "Side title" }),
      within(contentChoices).getByRole("radio", { name: "Centred stage" }),
      within(contentChoices).getByRole("radio", { name: "Editorial" }),
    ]);
    expect(within(contentChoices).getByRole("radio", { name: "Content" })).toBeChecked();
    expect(within(dialog).getByRole("heading", { name: "Content", level: 2 })).toBeInTheDocument();

    await user.click(assessmentTab);

    expect(assessmentTab).toHaveAttribute("aria-selected", "true");
    const assessmentChoices = within(dialog).getByRole("radiogroup", {
      name: "Assessment slides",
    });
    expect(within(assessmentChoices).getAllByRole("radio")).toEqual([
      within(assessmentChoices).getByRole("radio", { name: "Categorise Question" }),
      within(assessmentChoices).getByRole("radio", { name: "Sequencing Question" }),
    ]);
    expect(
      within(assessmentChoices).getByRole("radio", { name: "Categorise Question" }),
    ).toBeChecked();
  });

  it("renders the same theme-aware miniature slide in the rail and stage", async () => {
    await renderOpenPicker({ courseAppearance: "dark" });
    const previews = globalThis.document.body.querySelectorAll(
      '[data-surface-template-preview="slide-cover"]',
    );

    expect(previews).toHaveLength(2);
    for (const preview of previews) {
      expect(preview.getAttribute("aria-hidden")).toBe("true");
      expect(preview.querySelector(".sc-course")).toHaveClass("dark");
      expect(preview.querySelector('[data-preview-content="title"]')).toHaveTextContent(
        "A clear idea",
      );
      expect(preview.querySelector('[data-preview-content="label"]')).toHaveTextContent(
        "Learning moment",
      );
    }
  });

  it("selects a layout and confirms insertion by keyboard before restoring editor focus", async () => {
    const { dialog, editor, user } = await renderOpenPicker();
    await user.click(within(dialog).getByRole("tab", { name: "Content layouts" }));
    const twoColumns = within(dialog).getByRole("radio", { name: "Two columns" });

    twoColumns.focus();
    await user.keyboard(" ");
    expect(twoColumns).toBeChecked();
    within(dialog).getByRole("button", { name: "Add Two columns slide" }).focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Choose a slide layout" })).toBeNull();
    });
    expect(readSurfaceVariants(editor.getJSON())).toEqual(["slide-cover", "slide-two-columns"]);
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
  });

  it("keeps the picker open when insertion fails", async () => {
    const { dialog, editor, user } = await renderOpenPicker();
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setMeta(authoringSlideDividersPluginKey, {
          type: "open-template-picker",
          afterSurfaceId: "missing-surface",
        }),
      );
    });

    await user.click(within(dialog).getByRole("button", { name: "Add Cover slide" }));

    expect(screen.getByRole("dialog", { name: "Choose a slide layout" })).toBeInTheDocument();
    expect(readSurfaceVariants(editor.getJSON())).toEqual(["slide-cover"]);
  });

  it("inserts the selected layout immediately after the requesting surface", async () => {
    const { dialog, editor, user } = await renderOpenPicker({
      afterSurfaceId: FIRST_SURFACE_ID,
      surfaceIds: [FIRST_SURFACE_ID, SECOND_SURFACE_ID],
    });

    await user.click(within(dialog).getByRole("tab", { name: "Content layouts" }));
    await user.click(within(dialog).getByRole("button", { name: "Add Content slide" }));

    expect(readSurfaceVariants(editor.getJSON())).toEqual([
      "slide-cover",
      "slide-content",
      "slide-cover",
    ]);
  });

  it("inserts after an ordinary member inside its Course Section", () => {
    const editor = createSectionedEditor([
      courseSection(FIRST_SECTION_ID, "First"),
      slideCoverSurfaceDefinition.createSurface({ surfaceId: FIRST_SURFACE_ID }),
      slideCoverSurfaceDefinition.createSurface({ surfaceId: SECOND_SURFACE_ID }),
      courseSection(SECOND_SECTION_ID, "Second"),
      slideCoverSurfaceDefinition.createSurface({ surfaceId: THIRD_SURFACE_ID }),
    ]);

    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: FIRST_SURFACE_ID,
        variantId: "slide-content",
      }),
    ).toBe(true);
    expect(readCourseChildIds(editor.getJSON())).toEqual([
      FIRST_SECTION_ID,
      FIRST_SURFACE_ID,
      expect.not.stringMatching(new RegExp(`${FIRST_SURFACE_ID}|${SECOND_SURFACE_ID}`)),
      SECOND_SURFACE_ID,
      SECOND_SECTION_ID,
      THIRD_SURFACE_ID,
    ]);
  });

  it("inserts before a following Course Section boundary", () => {
    const editor = createSectionedEditor([
      courseSection(FIRST_SECTION_ID, "First"),
      slideCoverSurfaceDefinition.createSurface({ surfaceId: FIRST_SURFACE_ID }),
      slideCoverSurfaceDefinition.createSurface({ surfaceId: SECOND_SURFACE_ID }),
      courseSection(SECOND_SECTION_ID, "Second"),
      slideCoverSurfaceDefinition.createSurface({ surfaceId: THIRD_SURFACE_ID }),
    ]);

    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: SECOND_SURFACE_ID,
        variantId: "slide-content",
      }),
    ).toBe(true);
    expect(readCourseChildIds(editor.getJSON())).toEqual([
      FIRST_SECTION_ID,
      FIRST_SURFACE_ID,
      SECOND_SURFACE_ID,
      expect.not.stringMatching(new RegExp(`${FIRST_SURFACE_ID}|${SECOND_SURFACE_ID}`)),
      SECOND_SECTION_ID,
      THIRD_SURFACE_ID,
    ]);
  });

  it("keeps template insertion as one undoable document transaction", () => {
    const editor = createSectionedEditor(
      [
        courseSection(FIRST_SECTION_ID, "First"),
        slideCoverSurfaceDefinition.createSurface({ surfaceId: FIRST_SURFACE_ID }),
        slideCoverSurfaceDefinition.createSurface({ surfaceId: SECOND_SURFACE_ID }),
      ],
      true,
    );
    const before = editor.getJSON();
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: FIRST_SURFACE_ID,
        variantId: "slide-content",
      }),
    ).toBe(true);
    const after = editor.getJSON();
    expect(after).not.toEqual(before);
    expect(changedTransactions).toBe(1);

    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(changedTransactions).toBe(2);

    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON()).toEqual(after);
    expect(changedTransactions).toBe(3);
  });

  it.each(surfaceVariantsWithContribution.forMode("slideshow").map(({ id }) => [id] as const))(
    "completes document-unique identity before inserting registered template %s",
    (variantId) => {
      const editor = createEditor([FIRST_SURFACE_ID]);

      expect(
        insertSurfaceTemplateAfterSurface(editor, surfaceVariantsWithContribution, {
          afterSurfaceId: FIRST_SURFACE_ID,
          variantId,
        }),
      ).toBe(true);

      const insertedSurface = editor.state.doc.firstChild?.child(2);
      expect(insertedSurface?.attrs["variant"]).toBe(variantId);
      expectSchemaIdNodesToHaveDocumentUniqueIdentity(editor, insertedSurface);
      if (variantId === contributedSurfaceDefinition.id) {
        expect(insertedSurface?.firstChild?.attrs["id"]).toBe(CONTRIBUTED_REGION_ID);
      }
    },
  );

  it.each([
    ["malformed", "not-an-id"],
    ["duplicate", FIRST_SURFACE_ID],
  ] as const)("refuses a %s explicit factory ID without mutating the document", (_case, id) => {
    const definitionId = `invalid-${_case}-identity-test`;
    const invalidSurfaceVariants = createSurfaceVariantRegistry([
      ...builtInSurfaceVariantDefinitions,
      {
        id: definitionId,
        modes: ["slideshow"],
        title: "Invalid identity test",
        description: "An invalid contributed Surface used to verify refusal.",
        createSurface: ({ surfaceId }) => ({
          type: "surface",
          attrs: { id: surfaceId, variant: definitionId },
          content: [
            {
              type: "region",
              attrs: { id, role: "main" },
              content: [{ type: "paragraph" }],
            },
          ],
        }),
      },
    ]);
    const editor = createEditor([FIRST_SURFACE_ID]);
    const before = editor.getJSON();
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    expect(
      insertSurfaceTemplateAfterSurface(editor, invalidSurfaceVariants, {
        afterSurfaceId: FIRST_SURFACE_ID,
        variantId: definitionId,
      }),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(changedTransactions).toBe(0);
  });

  it("uses the variant ID for repeated insertion while allocating distinct stable instance IDs", () => {
    const editor = createEditor([FIRST_SURFACE_ID]);

    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: FIRST_SURFACE_ID,
        variantId: "slide-content",
      }),
    ).toBe(true);
    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: FIRST_SURFACE_ID,
        variantId: "slide-content",
      }),
    ).toBe(true);

    const surfaces = readSurfaces(editor.getJSON());
    expect(surfaces.map(({ variant }) => variant)).toEqual([
      "slide-cover",
      "slide-content",
      "slide-content",
    ]);
    expect(new Set(surfaces.map(({ id }) => id)).size).toBe(3);
    expect(surfaces.slice(1).every(({ id }) => /^[0-9A-Z_a-z-]{12}$/.test(String(id)))).toBe(true);
  });

  it("submits the created Surface and stable destination to the installed Course Structure command", () => {
    const applyCommand = vi.fn<(command: CourseStructureCommand) => void>();
    const commandExtension = Extension.create({
      name: "courseStructureCommands",
      addCommands() {
        return {
          applyCourseStructureCommand: (command: CourseStructureCommand) => () => {
            applyCommand(command);
            return false;
          },
        };
      },
    });
    const editor = createEditor([FIRST_SURFACE_ID], undefined, commandExtension);
    const before = editor.getJSON();

    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: FIRST_SURFACE_ID,
        variantId: "slide-content",
      }),
    ).toBe(false);
    expect(applyCommand).toHaveBeenCalledOnce();
    expect(applyCommand).toHaveBeenCalledWith({
      type: "surface.insert",
      surface: expect.objectContaining({
        type: expect.objectContaining({ name: "surface" }),
        attrs: expect.objectContaining({ variant: "slide-content" }),
      }),
      destination: { afterSurfaceId: FIRST_SURFACE_ID },
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("shows later catalogue definitions without picker-specific changes", async () => {
    const expandedSurfaceVariants = createSurfaceVariantRegistry([
      ...builtInSurfaceVariantDefinitions,
      {
        id: "surface-picker-auto-expansion-test",
        modes: ["slideshow"],
        title: "Later content layout",
        description: "A later registered layout used to prove automatic picker expansion.",
        catalogue: {
          section: "content",
          order: 9_990,
          preview: { kind: "slot", role: "content" },
        },
        createSurface: ({ surfaceId }) => ({
          type: "surface",
          attrs: { id: surfaceId, variant: "surface-picker-auto-expansion-test" },
          content: [{ type: "paragraph" }],
        }),
      },
    ]);

    const { dialog, user } = await renderOpenPicker({ surfaceVariants: expandedSurfaceVariants });
    await user.click(within(dialog).getByRole("tab", { name: "Content layouts" }));
    const contentChoices = within(dialog).getByRole("radiogroup", { name: "Content layouts" });

    const choices = within(contentChoices).getAllByRole("radio");
    expect(choices.at(-1)).toBe(
      within(contentChoices).getByRole("radio", { name: "Later content layout" }),
    );
  });
});

async function renderOpenPicker({
  afterSurfaceId = FIRST_SURFACE_ID,
  courseAppearance = "light",
  surfaceIds = [FIRST_SURFACE_ID],
  surfaceVariants: pickerSurfaceVariants = surfaceVariants,
}: {
  afterSurfaceId?: string;
  courseAppearance?: "light" | "dark";
  surfaceIds?: readonly EmbeddedNodeId[];
  surfaceVariants?: typeof surfaceVariants;
} = {}) {
  const user = userEvent.setup();
  const editorElement = globalThis.document.createElement("div");
  globalThis.document.body.append(editorElement);
  editorElements.push(editorElement);
  const editor = createEditor(surfaceIds, editorElement);

  render(
    createElement(SurfaceTemplatePicker, {
      courseAppearance,
      editor,
      surfaceCreationCatalog: createSurfaceCreationCatalog(pickerSurfaceVariants),
      surfaceVariants: pickerSurfaceVariants,
    }),
  );
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setMeta(authoringSlideDividersPluginKey, {
        type: "open-template-picker",
        afterSurfaceId,
      }),
    );
  });
  const dialog = await screen.findByRole("dialog", { name: "Choose a slide layout" });

  return { dialog, editor, user };
}

function createEditor(
  surfaceIds: readonly EmbeddedNodeId[],
  editorElement?: HTMLElement,
  courseStructureExtension = createCourseStructureCommandsExtension(),
): Editor {
  return createEditorForDocument(
    slideshowDocument(surfaceIds),
    editorElement,
    courseStructureExtension,
  );
}

function createSectionedEditor(children: readonly JSONContent[], withHistory = false): Editor {
  return createEditorForDocument(
    slideshowDocumentWithChildren(children),
    undefined,
    createCourseStructureCommandsExtension(),
    withHistory,
  );
}

function createEditorForDocument(
  content: JSONContent,
  editorElement?: HTMLElement,
  courseStructureExtension = createCourseStructureCommandsExtension(),
  withHistory = false,
): Editor {
  const element = editorElement ?? globalThis.document.createElement("div");
  if (!editorElement) {
    globalThis.document.body.append(element);
    editorElements.push(element);
  }
  const editor = new Editor({
    element,
    extensions: [
      DocumentNode,
      createScaffoldCapabilitiesStorageExtension(testCapabilities),
      StarterKit.configure({
        document: false,
        heading: false,
        paragraph: false,
        undoRedo: withHistory ? {} : false,
      }),
      ExtendedParagraph,
      ExtendedHeading,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      SlideTitleNode,
      SlideCoverSubtitleNode,
      SurfaceCategoriseQuestionNode,
      SurfaceSequencingQuestionNode,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentActionsGroupNode,
      AssessmentHintNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      CategoriseAuthoringExtension,
      SequencingAuthoringExtension,
      TestArrangementNode,
      TestSectionArrangementNode,
      AuthoringSlideDividers,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      courseStructureExtension,
    ],
    content,
  });
  editors.push(editor);
  return editor;
}

function slideshowDocument(surfaceIds: readonly EmbeddedNodeId[]): JSONContent {
  return slideshowDocumentWithChildren([
    courseSection(createEmbeddedNodeId() as EmbeddedNodeId, "Introduction"),
    ...surfaceIds.map((surfaceId) => slideCoverSurfaceDefinition.createSurface({ surfaceId })),
  ]);
}

function slideshowDocumentWithChildren(children: readonly JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: createEmbeddedNodeId(),
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
          theme: createDefaultPersistedCourseTheme(),
        },
        content: [...children],
      },
    ],
  };
}

function courseSection(id: EmbeddedNodeId, title: string): JSONContent {
  return { type: "courseSection", attrs: { id, title } };
}

function readCourseChildIds(document: JSONContent): unknown[] {
  return (document.content?.[0]?.content ?? []).map((child) => child.attrs?.["id"]);
}

function readSurfaceVariants(document: JSONContent): unknown[] {
  return readSurfaces(document).map(({ variant }) => variant);
}

function readSurfaces(document: JSONContent) {
  return (document.content?.[0]?.content ?? [])
    .filter((node) => node.type === "surface")
    .map((surface) => ({
      id: surface.attrs?.["id"],
      variant: surface.attrs?.["variant"],
    }));
}

function expectSchemaIdNodesToHaveDocumentUniqueIdentity(
  editor: Editor,
  subtree: ProseMirrorNode | undefined,
): void {
  expect(subtree).toBeDefined();
  if (!subtree) return;

  const documentIdCounts = new Map<string, number>();
  editor.state.doc.descendants((node) => {
    const parsed = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
    if (parsed.success) {
      documentIdCounts.set(parsed.data, (documentIdCounts.get(parsed.data) ?? 0) + 1);
    }
    return true;
  });

  const identityNodes = [subtree];
  subtree.descendants((node) => {
    identityNodes.push(node);
    return true;
  });
  for (const node of identityNodes) {
    if (!Object.hasOwn(node.type.spec.attrs ?? {}, "id")) continue;
    const parsed = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
    expect(parsed.success, `expected ${node.type.name} to have a valid ID`).toBe(true);
    if (parsed.success) expect(documentIdCounts.get(parsed.data)).toBe(1);
  }
}
