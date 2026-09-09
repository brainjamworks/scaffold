import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { Editor, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor.test-harness";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import {
  createInteractionStore,
  type InteractionStore,
} from "@/editor/interactions/targets/facade/interaction-store";
import {
  createInteractionChromeSlot,
  createInteractionOwnerSnapshot,
  InteractionChromeSlotReason,
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { createInteractionOwnerCommandPorts } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-command-ports";
import { resolveStructuralChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { InteractionSettingsSheetHost } from "@/editor/shell/settings/sheets/InteractionSettingsSheetHost";
import {
  SurfaceMenuBubbleContent,
  resolveSurfaceMenuSnapshot,
} from "@/editor/surfaces/authoring/chrome/surface-bubble-controls";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import "@/styles/globals.css";
import "@/theme/app/AppThemeProvider.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const SECOND_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00002");
const QUESTION_ID = EmbeddedNodeIdSchema.parse("target000001");
const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();

const workflows = [
  {
    design: "scaffold-flow",
    variantId: "slide-drag-drop-question",
    sheetTitle: "Drag and Drop settings",
    variantFieldLabel: "Accessible response label",
    variantFieldValue: "Place the landmarks",
    variantSetting: "legend",
  },
  {
    design: "scaffold-flow",
    variantId: "slide-dropdown-question",
    sheetTitle: "Dropdown settings",
    variantFieldLabel: "Label",
    variantFieldValue: "Choose a capital",
    variantSetting: "label",
  },
  {
    design: "pocket-atlas",
    variantId: "slide-fill-blanks-question",
    sheetTitle: "Fill in the blanks settings",
    variantFieldLabel: "Accessible response label",
    variantFieldValue: "Complete the sentence",
    variantSetting: "legend",
  },
] as const;

describe("assessment Surface configuration authoring", () => {
  it("persists Quiz settings through the private Quiz owner", async () => {
    const editor = createEditor("slide-quiz");
    const descriptor = resolveSurfaceDescriptor(editor);
    const menuSnapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );
    if (!menuSnapshot) throw new Error('Expected authoring chrome for "slide-quiz".');
    const store = createSurfaceInteractionStore(descriptor.target);
    const rendered = await renderBrowserReact(
      <div className="sc-app radix-themes light">
        <InteractionProvider store={store}>
          <TooltipProvider>
            <SurfaceMenuBubbleContent
              descriptor={descriptor}
              editor={editor}
              snapshot={menuSnapshot}
            />
            <InteractionSettingsSheetHost
              blockDefinitions={builtInBlockRegistry}
              editor={editor}
              surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
            />
          </TooltipProvider>
        </InteractionProvider>
      </div>,
    );

    try {
      await userEvent.click(page.getByRole("button", { name: "Open surface settings" }));
      await expect.element(page.getByRole("heading", { name: "Quiz settings" })).toBeVisible();
      await userEvent.click(page.getByRole("switch", { name: "Allow backtracking" }));
      await userEvent.click(page.getByRole("combobox", { name: "Review timing" }));
      await userEvent.click(page.getByRole("option", { name: "After each answer" }));
      await userEvent.click(page.getByRole("button", { name: "Scoring" }));
      await userEvent.click(page.getByRole("switch", { name: "Graded" }));
      await userEvent.click(page.getByRole("button", { name: "Save" }));

      expect(questionSettings(editor)).toMatchObject({
        allowBacktracking: false,
        reviewTiming: "after_each_answer",
        isGraded: false,
      });
      expect(surfaceSettings(editor)).toEqual({
        background: { color: "#123456" },
        retainedSurfaceSetting: "keep-me",
        header: { enabled: false },
        footer: { enabled: false },
      });
    } finally {
      await rendered.unmount();
      editor.destroy();
    }
  });

  it.each(workflows)(
    "keeps the Surface owner while editing $variantId under $design",
    async ({
      design,
      sheetTitle,
      variantFieldLabel,
      variantFieldValue,
      variantId,
      variantSetting,
    }) => {
      const editor = createEditor(variantId);
      const descriptor = resolveSurfaceDescriptor(editor);
      const menuSnapshot = resolveSurfaceMenuSnapshot(
        editor,
        descriptor,
        builtInSurfaceAuthoringChromeResolver,
      );
      if (!menuSnapshot) throw new Error(`Expected authoring chrome for "${variantId}".`);
      const store = createSurfaceInteractionStore(descriptor.target);
      const dispatch = vi.spyOn(editor.view, "dispatch");
      const rendered = await renderBrowserReact(
        <div className="sc-app radix-themes light">
          <InteractionProvider store={store}>
            <TooltipProvider>
              <div data-testid="assessment-surface-app-chrome">
                <SurfaceMenuBubbleContent
                  descriptor={descriptor}
                  editor={editor}
                  snapshot={menuSnapshot}
                />
                <InteractionSettingsSheetHost
                  blockDefinitions={builtInBlockRegistry}
                  editor={editor}
                  surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
                />
              </div>
            </TooltipProvider>
          </InteractionProvider>
          <div className={`sc-course sc-course-theme-${design}-v1`} data-course-design={design} />
        </div>,
      );

      try {
        const settingsButton = requiredElement<HTMLButtonElement>(
          'button[aria-label="Open surface settings"]',
        );
        expect(settingsButton.closest(".sc-course")).toBeNull();
        expect(document.querySelector(`[data-course-design="${design}"]`)).not.toBeNull();

        await userEvent.click(page.getByRole("button", { name: "Graded (on)" }));
        expect(questionSettings(editor)).toMatchObject({ isGraded: false });
        expect(surfaceSettings(editor)).toEqual({
          background: { color: "#123456" },
          retainedSurfaceSetting: "keep-me",
          header: { enabled: false },
          footer: { enabled: false },
        });
        expect(store.getState().snapshot.owners.effectiveOwner.target).toEqual(descriptor.target);

        dispatch.mockClear();
        settingsButton.focus({ preventScroll: true });
        expect(document.activeElement).toBe(settingsButton);
        await userEvent.keyboard("{Enter}");
        await expect.element(page.getByRole("heading", { name: sheetTitle })).toBeVisible();

        const dialog = requiredElement<HTMLElement>('[role="dialog"]');
        expect(dialog.closest(".sc-course")).toBeNull();
        expect(dialog.textContent).toContain("Behaviour");
        expect(dialog.textContent).toContain("Header and footer");
        expect(dialog.textContent).not.toContain("Background");
        expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);

        const points = page.getByRole("spinbutton", { name: "Points" });
        await userEvent.clear(points);
        await userEvent.type(points, "7");
        await userEvent.click(page.getByRole("switch", { name: "Show header" }));
        await userEvent.click(page.getByRole("button", { name: "Presentation" }));
        const variantField = page.getByRole("textbox", { name: variantFieldLabel });
        await userEvent.clear(variantField);
        await userEvent.type(variantField, variantFieldValue);
        await userEvent.click(page.getByRole("button", { name: "Save" }));

        await expect.poll(() => dispatch.mock.calls.length).toBe(1);
        expect(questionSettings(editor)).toMatchObject({
          isGraded: false,
          points: 7,
          [variantSetting]: variantFieldValue,
        });
        expect(surfaceSettings(editor)).toEqual({
          background: { color: "#123456" },
          retainedSurfaceSetting: "keep-me",
          header: { enabled: true },
          footer: { enabled: false },
        });
        expect(surfaceChildTypes(editor)).toEqual(["surface_header", questionNodeType(editor)]);
        await expect
          .poll(() => document.activeElement?.getAttribute("aria-label"))
          .toBe("Open surface settings");
        expect(store.getState().snapshot.owners.effectiveOwner.target).toEqual(descriptor.target);
      } finally {
        await rendered.unmount();
        editor.destroy();
      }
    },
  );

  it.each(workflows)(
    "keeps production App chrome outside the $design Course theme for $variantId",
    async ({ design, sheetTitle, variantId }) => {
      const editorRef: { current: Editor | null } = { current: null };
      const host = document.createElement("div");
      document.body.append(host);
      const rendered = await renderBrowserReact(
        <div className="sc-app radix-themes light">
          <CourseDocumentEditor
            composition={coreAuthoringComposition}
            source={{
              mode: "document",
              content: createProductionAuthoringDocument(variantId, design),
            }}
            onReady={(editor) => {
              editorRef.current = editor;
            }}
          />
        </div>,
        { baseElement: document.body, container: host },
      );

      try {
        await expect.poll(() => editorRef.current !== null).toBe(true);
        await expect
          .poll(() => host.querySelector('[data-testid="course-document-editor"]') !== null)
          .toBe(true);
        const editor = editorRef.current;
        if (!editor) throw new Error("Expected the production authoring editor.");

        const editorRoot = requiredElement<HTMLElement>('[data-testid="course-document-editor"]');
        const chromeRoot = requiredDescendant<HTMLElement>(editorRoot, ".sc-authoring-chrome-root");
        const courseScope = requiredDescendant<HTMLElement>(
          editorRoot,
          `.sc-course.sc-course-theme-${design}-v1`,
        );
        const overlayHost = requiredDescendant<HTMLElement>(
          editorRoot,
          ":scope > [data-scaffold-overlay-host]",
        );

        expect(courseScope.closest(".sc-authoring-chrome-root")).toBe(chromeRoot);
        expect(overlayHost.closest(".sc-course")).toBeNull();

        editor.view.dom.focus({ preventScroll: true });
        const ports = createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry);
        expect(
          ports.activateStructuralTarget({
            id: SURFACE_ID,
            kind: InteractionTargetKind.Surface,
            pos: nodePosById(editor, SURFACE_ID),
          }),
        ).toBe(true);

        const surfaceOptions = page.getByRole("button", { name: "Surface options" });
        await expect.element(surfaceOptions).toBeVisible();
        await userEvent.click(surfaceOptions);

        const settingsButton = page.getByRole("button", { name: "Open surface settings" });
        await expect.element(settingsButton).toBeVisible();
        const settingsElement = requiredElement<HTMLButtonElement>(
          'button[aria-label="Open surface settings"]',
        );
        expect(settingsElement.closest("[data-scaffold-overlay-host]")).toBe(overlayHost);
        expect(settingsElement.closest(".sc-course")).toBeNull();

        await userEvent.click(settingsButton);
        await expect.element(page.getByRole("heading", { name: sheetTitle })).toBeVisible();
        const dialog = requiredElement<HTMLElement>('[role="dialog"]');
        expect(dialog.closest("[data-scaffold-overlay-host]")).toBe(overlayHost);
        expect(dialog.closest(".sc-course")).toBeNull();
      } finally {
        await rendered.unmount();
        editorRef.current?.destroy();
      }
    },
  );
});

function createEditor(variantId: string): Editor {
  const definition = builtInSurfaceVariantRegistry.get(variantId);
  if (!definition) throw new Error(`Expected Surface definition "${variantId}".`);
  const createdSurface = definition.createSurface({ surfaceId: SURFACE_ID });
  const createdQuestion = createdSurface.content?.[0];
  if (!createdQuestion) throw new Error(`Expected Surface "${variantId}" to create a question.`);

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
                settings: {
                  background: { color: "#123456" },
                  retainedSurfaceSetting: "keep-me",
                },
              },
              content: [
                {
                  ...createdQuestion,
                  attrs: { ...createdQuestion.attrs, id: QUESTION_ID },
                },
              ],
            },
          ],
        },
      ],
    },
  });
}

function createProductionAuthoringDocument(
  variantId: string,
  design: "scaffold-flow" | "pocket-atlas",
): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get(variantId);
  if (!definition) throw new Error(`Expected Surface definition "${variantId}".`);

  return withCurrentNodeIds({
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: createEmbeddedNodeId(),
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          requiresScaffoldPlus: false,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
          theme: courseTheme(design),
          learnerInteractions: {
            schemaVersion: 1,
            surfaces: [
              {
                surfaceId: SURFACE_ID,
                rules: [
                  {
                    id: "rule00000001",
                    isEnabled: false,
                    when: { targetId: SURFACE_ID, type: "complete" },
                    conditions: [],
                    commands: [{ kind: "navigate-surface", surfaceId: SURFACE_ID }],
                  },
                ],
              },
              {
                surfaceId: SECOND_SURFACE_ID,
                rules: [
                  {
                    id: "rule00000002",
                    isEnabled: false,
                    when: { targetId: SECOND_SURFACE_ID, type: "complete" },
                    conditions: [],
                    commands: [{ kind: "navigate-surface", surfaceId: SECOND_SURFACE_ID }],
                  },
                ],
              },
            ],
          },
          presentation: {
            schemaVersion: 1,
            autoAdvance: false,
            allowPrevious: true,
            surfaces: [
              { surfaceId: SURFACE_ID, durationMs: 0, layerTracks: [], actions: [] },
              { surfaceId: SECOND_SURFACE_ID, durationMs: 0, layerTracks: [], actions: [] },
            ],
          },
        },
        content: [
          {
            type: "courseSection",
            attrs: { id: createEmbeddedNodeId(), title: "Introduction" },
          },
          definition.createSurface({ surfaceId: SURFACE_ID }),
          definition.createSurface({ surfaceId: SECOND_SURFACE_ID }),
        ],
      },
    ],
  });
}

function resolveSurfaceDescriptor(editor: Editor) {
  const descriptor = resolveStructuralChromeTargetDescriptor(editor.state, {
    id: SURFACE_ID,
    kind: "surface",
  });
  if (descriptor?.kind !== "surface") {
    throw new Error("Expected a Surface chrome descriptor.");
  }
  return descriptor;
}

function createSurfaceInteractionStore(target: InteractionTargetRef): InteractionStore {
  let store: InteractionStore;
  store = createInteractionStore({
    snapshot: createInteractionOwnerSnapshot({ menuOwner: target }),
    commandPorts: {
      openSettings(nextTarget) {
        store.getState().publishSnapshot(
          createInteractionOwnerSnapshot({
            settingsOwner: nextTarget,
            chromeSlots: {
              settingsSheet: createInteractionChromeSlot({
                reason: InteractionChromeSlotReason.Allowed,
                target: nextTarget,
                visible: true,
              }),
            },
          }),
        );
        return true;
      },
      dismissInteraction() {
        store.getState().publishSnapshot(createInteractionOwnerSnapshot({ menuOwner: target }));
        return true;
      },
    },
  });
  return store;
}

function surfaceNode(editor: Editor): ProseMirrorNode {
  let found: ProseMirrorNode | undefined;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "surface" && node.attrs["id"] === SURFACE_ID) {
      found = node;
      return false;
    }
    return true;
  });
  if (!found) throw new Error("Expected assessment Surface node.");
  return found;
}

function questionNode(editor: Editor): ProseMirrorNode {
  let found: ProseMirrorNode | undefined;
  editor.state.doc.descendants((node) => {
    if (node.attrs["id"] === QUESTION_ID) {
      found = node;
      return false;
    }
    return true;
  });
  if (!found) throw new Error("Expected fixed assessment question node.");
  return found;
}

function surfaceSettings(editor: Editor): Record<string, unknown> {
  return surfaceNode(editor).attrs["settings"] as Record<string, unknown>;
}

function questionSettings(editor: Editor): Record<string, unknown> {
  return questionNode(editor).attrs["settings"] as Record<string, unknown>;
}

function questionNodeType(editor: Editor): string {
  return questionNode(editor).type.name;
}

function surfaceChildTypes(editor: Editor): string[] {
  const types: string[] = [];
  surfaceNode(editor).forEach((child) => types.push(child.type.name));
  return types;
}

function nodePosById(editor: Editor, nodeId: string): number {
  let result = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== nodeId) return true;
    result = pos;
    return false;
  });
  if (result < 0) throw new Error(`Expected node "${nodeId}".`);
  return result;
}

function courseTheme(design: "scaffold-flow" | "pocket-atlas") {
  return {
    schemaVersion: 1 as const,
    design: { id: design, revision: "1" },
    colourSystem: { id: design === "scaffold-flow" ? "scaffold-indigo" : design, revision: "1" },
    overrides: {},
  };
}

function withCurrentNodeIds(document: JSONContent): JSONContent {
  const pending = [document];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.type !== "doc" && node.type !== "text" && node.attrs?.["id"] === undefined) {
      node.attrs = { ...node.attrs, id: createEmbeddedNodeId() };
    }
    pending.push(...(node.content ?? []));
  }
  return document;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element ${selector}.`);
  return element;
}

function requiredDescendant<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected descendant ${selector}.`);
  return element;
}
