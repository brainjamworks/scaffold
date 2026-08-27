// @vitest-environment jsdom

import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { TabsIcon as Tabs } from "@phosphor-icons/react";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { getControlBindingRegistryForEditor } from "@/document/control-binding";
import { semanticActivationRequest } from "@/document/authoring/semantic-document/testing/semantic-activation-binding-test-extension";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { CellRuntimeNode, GridRuntimeNode } from "@/editor/arrangements/grid/runtime/grid-nodes";

import { builtInLayoutDefinitions } from "../model/built-in-layout-definitions";
import { builtInLayoutRuntimeViews } from "../runtime/built-in-layout-views";
import type { LayoutDefinition } from "../model/layout-definition";
import { createLayoutRegistry } from "../model/layout-registry";
import { createLayoutRuntimeViewRegistry } from "../runtime/layout-view-registry";
import { createLayoutNode, createSectionNode } from "../model/layout-nodes";
import {
  createLayoutRuntimeNodeView,
  createSectionRuntimeNodeView,
} from "../runtime/layout-node-views";
import { LayoutRuntimeNode, SectionRuntimeNode } from "../runtime/layout-nodes";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { accordionLayoutDefinition } from "../accordion/accordion-definition";
import { accordionPanelId, accordionTriggerId } from "../accordion/accordion-components";
import { paginatedLayoutDefinition } from "../paginated/paginated-definition";
import { paginatedPageButtonId, paginatedPagePanelId } from "../paginated/paginated-components";
import { tabsLayoutDefinition } from "../tabs/tabs-definition";
import { tabPanelId, tabTriggerId } from "../tabs/tabs-components";
import { createTestNodeIdentityExtension } from "@/editor/testing";
import { getLayoutInteractionStoreState } from "../shared/model/layout-interaction-store";

const learningEventReporter = vi.hoisted(() => ({ report: vi.fn() }));
const learningEventReport = learningEventReporter.report;

vi.mock("@/runtime/learning-events/LearningEventRuntimeProvider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/runtime/learning-events/LearningEventRuntimeProvider")>();
  return {
    ...actual,
    useLearningEventReporter: () => learningEventReporter,
  };
});

const boundedRuntimeLayoutDefinition = {
  id: "test-bounded-runtime-layout",
  title: "Bounded runtime layout",
  description: "Runtime layout fixture that opts into bounded fill placement",
  icon: Tabs,
  boundedPlacement: "fill",
  createContent: () => ({
    type: "layout",
    attrs: { variant: "test-bounded-runtime-layout" },
    content: [{ type: "section" }],
  }),
} satisfies LayoutDefinition;

const testLayoutRegistry = createLayoutRegistry([
  ...builtInLayoutDefinitions,
  boundedRuntimeLayoutDefinition,
]);
const testLayoutRuntimeViewRegistry = createLayoutRuntimeViewRegistry(testLayoutRegistry, [
  ...builtInLayoutRuntimeViews,
  { id: boundedRuntimeLayoutDefinition.id },
]);
const TestLayoutRuntimeNode = createLayoutNode({
  addNodeView: () => createLayoutRuntimeNodeView(testLayoutRegistry, testLayoutRuntimeViewRegistry),
});
const TestSectionRuntimeNode = createSectionNode({
  addNodeView: () =>
    createSectionRuntimeNodeView(testLayoutRegistry, testLayoutRuntimeViewRegistry),
});

const semanticRuntimeComposition = createCoreScaffoldRuntimeComposition();
const SEMANTIC_RUNTIME_CASES = [
  {
    variant: "tabs",
    layoutId: "layoutTabsRt",
    sectionIds: ["sectionTabR1", "sectionTabR2"],
  },
  {
    variant: "accordion",
    layoutId: "layoutAccoRt",
    sectionIds: ["sectionAccR1", "sectionAccR2"],
    allowMultiple: true,
  },
  {
    variant: "paginated",
    layoutId: "layoutPageRt",
    sectionIds: ["sectionPagR1", "sectionPagR2"],
  },
] as const satisfies readonly RuntimeSemanticLayoutCase[];

describe("layout runtime nodes", () => {
  it.each(SEMANTIC_RUNTIME_CASES)(
    "reveals the exact hidden $variant Section through the runtime coordinator",
    async (testCase) => {
      learningEventReport.mockClear();
      const editor = new Editor({
        editable: false,
        extensions: createCourseDocumentRuntimeExtensions({
          composition: semanticRuntimeComposition,
        }),
        content: runtimeSemanticLayoutDocument(testCase),
      });
      const initiatingControl = document.createElement("button");
      const click = vi.fn();
      const keydown = vi.fn();

      try {
        const rendered = render(createElement(EditorContent, { editor }));
        const layoutId = EmbeddedNodeIdSchema.parse(testCase.layoutId);
        const targetId = EmbeddedNodeIdSchema.parse(testCase.sectionIds[1]);
        const panelId = runtimePanelId(testCase, targetId);
        const authoredDocument = editor.getJSON();
        const selection = editor.state.selection.toJSON();
        document.body.append(initiatingControl);
        initiatingControl.focus();
        document.addEventListener("click", click);
        document.addEventListener("keydown", keydown);

        await waitFor(() => {
          expect(document.getElementById(panelId)).toHaveAttribute("hidden");
          expect(environmentRegistryResolution(editor, layoutId).kind).toBe("resolved");
          expect(learningEventReport).toHaveBeenCalledWith(
            expect.objectContaining({ sectionId: testCase.sectionIds[0] }),
          );
        });
        learningEventReport.mockClear();

        const environment = getSemanticTargetInteractionEnvironmentForEditor(editor);
        await expect(
          environment.coordinator.activate(targetId, {
            origin: "configured-presentation",
          }),
        ).resolves.toEqual({ kind: "reached", requestedId: targetId });

        await waitFor(() => {
          expect(document.getElementById(panelId)).not.toHaveAttribute("hidden");
        });
        if (testCase.variant === "accordion") {
          expect(
            getLayoutInteractionStoreState(editor).openAccordionSectionsByLayoutId[layoutId],
          ).toEqual([testCase.sectionIds[0], targetId]);
        }
        expect(learningEventReport).not.toHaveBeenCalled();
        expect(editor.getJSON()).toEqual(authoredDocument);
        expect(editor.state.selection.toJSON()).toEqual(selection);
        expect(document.activeElement).toBe(initiatingControl);
        expect(click).not.toHaveBeenCalled();
        expect(keydown).not.toHaveBeenCalled();

        const binding = requireRuntimeSemanticActivationBinding(editor, layoutId);
        await expect(
          binding.activate(semanticActivationRequest(layoutId, targetId, { ownerKind: "layout" })),
        ).resolves.toEqual({ kind: "already-visible", ownerId: layoutId, childId: targetId });
        const foreignChildId = EmbeddedNodeIdSchema.parse("foreignSec01");
        await expect(
          binding.activate(
            semanticActivationRequest(layoutId, foreignChildId, { ownerKind: "layout" }),
          ),
        ).resolves.toEqual({
          kind: "unavailable",
          ownerId: layoutId,
          childId: foreignChildId,
          reason: "child-missing",
        });

        rendered.unmount();
        expect(environmentRegistryResolution(editor, layoutId)).toEqual({
          kind: "unavailable",
          ownerId: layoutId,
          reason: "owner-unmounted",
        });
      } finally {
        document.removeEventListener("click", click);
        document.removeEventListener("keydown", keydown);
        initiatingControl.remove();
        editor.destroy();
      }
    },
  );

  it("reveals nested runtime Layout owners outer-to-inner in one isolated store", async () => {
    learningEventReport.mockClear();
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({
        composition: semanticRuntimeComposition,
      }),
      content: nestedRuntimeTabsDocument(),
    });

    try {
      render(createElement(EditorContent, { editor }));
      const outerLayoutId = EmbeddedNodeIdSchema.parse("layoutOutRt1");
      const outerTargetId = EmbeddedNodeIdSchema.parse("outerSectRt2");
      const innerLayoutId = EmbeddedNodeIdSchema.parse("layoutInnRt1");
      const innerTargetId = EmbeddedNodeIdSchema.parse("innerSectRt2");
      const outerPanelId = tabPanelId(outerLayoutId, outerTargetId);
      const innerPanelId = tabPanelId(innerLayoutId, innerTargetId);
      const environment = getSemanticTargetInteractionEnvironmentForEditor(editor);

      await waitFor(() => {
        expect(elementWithIdWithin(editor.view.dom, outerPanelId)).toHaveAttribute("hidden");
        expect(elementWithIdWithin(editor.view.dom, innerPanelId)).toHaveAttribute("hidden");
        expect(environment.registry.resolve(outerLayoutId).kind).toBe("resolved");
        expect(environment.registry.resolve(innerLayoutId).kind).toBe("resolved");
      });
      learningEventReport.mockClear();

      await expect(
        environment.coordinator.activate(innerTargetId, {
          origin: "configured-presentation",
        }),
      ).resolves.toEqual({ kind: "reached", requestedId: innerTargetId });

      await waitFor(() => {
        expect(elementWithIdWithin(editor.view.dom, outerPanelId)).not.toHaveAttribute("hidden");
        expect(elementWithIdWithin(editor.view.dom, innerPanelId)).not.toHaveAttribute("hidden");
      });
      const interactionState = getLayoutInteractionStoreState(editor);
      expect(interactionState.activeTabByLayoutId).toMatchObject({
        [outerLayoutId]: outerTargetId,
        [innerLayoutId]: innerTargetId,
      });
      expect(learningEventReport).not.toHaveBeenCalled();
    } finally {
      editor.destroy();
    }
  });

  it("suppresses learner events for back-to-back semantic Accordion openings", async () => {
    learningEventReport.mockClear();
    const testCase = {
      variant: "accordion",
      layoutId: "layoutAccMul",
      sectionIds: ["sectionAccM1", "sectionAccM2", "sectionAccM3"],
      allowMultiple: true,
    } as const satisfies RuntimeSemanticLayoutCase;
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({
        composition: semanticRuntimeComposition,
      }),
      content: runtimeSemanticLayoutDocument(testCase),
    });

    try {
      render(createElement(EditorContent, { editor }));
      const layoutId = EmbeddedNodeIdSchema.parse(testCase.layoutId);
      const secondSectionId = EmbeddedNodeIdSchema.parse(testCase.sectionIds[1]);
      const thirdSectionId = EmbeddedNodeIdSchema.parse(testCase.sectionIds[2]);

      await waitFor(() => {
        expect(environmentRegistryResolution(editor, layoutId).kind).toBe("resolved");
        expect(learningEventReport).toHaveBeenCalledWith(
          expect.objectContaining({ sectionId: testCase.sectionIds[0] }),
        );
      });
      learningEventReport.mockClear();

      const binding = requireRuntimeSemanticActivationBinding(editor, layoutId);
      const secondActivation = binding.activate(
        semanticActivationRequest(layoutId, secondSectionId, { ownerKind: "layout" }),
      );
      const thirdActivation = binding.activate(
        semanticActivationRequest(layoutId, thirdSectionId, { ownerKind: "layout" }),
      );

      await expect(secondActivation).resolves.toEqual({
        kind: "interrupted",
        ownerId: layoutId,
        childId: secondSectionId,
      });
      await expect(thirdActivation).resolves.toEqual({
        kind: "revealed",
        ownerId: layoutId,
        childId: thirdSectionId,
      });
      await waitFor(() => {
        expect(
          getLayoutInteractionStoreState(editor).openAccordionSectionsByLayoutId[layoutId],
        ).toEqual([testCase.sectionIds[0], secondSectionId, thirdSectionId]);
      });
      expect(learningEventReport).not.toHaveBeenCalled();
    } finally {
      editor.destroy();
    }
  });

  it.each(SEMANTIC_RUNTIME_CASES)(
    "reports genuine learner interaction with the $variant runtime",
    async (testCase) => {
      learningEventReport.mockClear();
      const user = userEvent.setup();
      const editor = new Editor({
        editable: false,
        extensions: createCourseDocumentRuntimeExtensions({
          composition: semanticRuntimeComposition,
        }),
        content: runtimeSemanticLayoutDocument(testCase),
      });

      try {
        render(createElement(EditorContent, { editor }));
        const targetId = testCase.sectionIds[1];

        await waitFor(() => {
          expect(learningEventReport).toHaveBeenCalledWith(
            expect.objectContaining({ sectionId: testCase.sectionIds[0] }),
          );
        });
        learningEventReport.mockClear();

        const control = document.getElementById(runtimeControlId(testCase, targetId));
        if (!(control instanceof HTMLElement)) {
          throw new Error(`Missing ${testCase.variant} runtime control`);
        }
        await user.click(control);

        await waitFor(() => {
          expect(learningEventReport).toHaveBeenCalledWith({
            type: "layout-section.experienced",
            layoutId: testCase.layoutId,
            sectionId: targetId,
            layoutKind: testCase.variant,
            position: 2,
            count: 2,
          });
        });
      } finally {
        editor.destroy();
      }
    },
  );

  it("treats Tabs control-command selection as programmatic", async () => {
    learningEventReport.mockClear();
    const testCase = SEMANTIC_RUNTIME_CASES[0];
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({
        composition: semanticRuntimeComposition,
      }),
      content: runtimeSemanticLayoutDocument(testCase),
    });

    try {
      render(createElement(EditorContent, { editor }));
      const layoutId = EmbeddedNodeIdSchema.parse(testCase.layoutId);
      const targetId = EmbeddedNodeIdSchema.parse(testCase.sectionIds[1]);
      const registry = getControlBindingRegistryForEditor(editor);

      await waitFor(() => {
        expect(registry.get(layoutId)).toBeDefined();
        expect(learningEventReport).toHaveBeenCalledWith(
          expect.objectContaining({ sectionId: testCase.sectionIds[0] }),
        );
      });
      learningEventReport.mockClear();

      const result = await registry.get(layoutId)?.commandExecutor?.execute({
        targetId,
        type: "select",
        signal: new AbortController().signal,
      });

      expect(result?.isOk()).toBe(true);
      await waitFor(() => {
        expect(
          getLayoutInteractionStoreState(editor).activeTabByLayoutId[layoutId],
        ).toBe(targetId);
      });
      expect(learningEventReport).not.toHaveBeenCalled();
    } finally {
      editor.destroy();
    }
  });

  it("renders built-in layouts without authoring chrome", async () => {
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({
        composition: semanticRuntimeComposition,
      }),
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "page" },
            content: [
              {
                type: "surface",
                attrs: {
                  id: "surfaceRun01",
                  variant: "page-default",
                },
                content: [
                  {
                    type: "layout",
                    attrs: {
                      id: "layoutRun001",
                      variant: "tabs",
                      options: { variant: "default", label: "Runtime tabs" },
                    },
                    content: [
                      runtimeTabSection("sectionRun01", "First tab"),
                      runtimeTabSection("sectionRun02", "Second tab"),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector('[data-node="layout"][data-definition="tabs"]'),
        ).not.toBeNull();
      });

      const layoutElement = document.body.querySelector(
        '[data-node="layout"][data-definition="tabs"]',
      );
      const sectionElement = document.body.querySelector(
        '[data-node="section"][data-definition="tabs"]',
      );
      const panelElement = sectionElement?.querySelector(".sc-course-tabs__panel");

      expect(layoutElement?.getAttribute("data-bounded-placement")).toBe("fill");
      expect(layoutElement?.getAttribute("data-runtime-frame")).toBe("layout");
      expect(layoutElement?.getAttribute("data-state")).toBeNull();
      expect(sectionElement?.getAttribute("data-runtime-frame")).toBe("section");
      expect(sectionElement?.getAttribute("data-state")).toBeNull();
      expect(panelElement?.getAttribute("data-state")).toBe("active");
      expect(document.body.querySelector('[role="tablist"]')).not.toBeNull();
      expect(document.body.querySelector("[data-authoring-frame]")).toBeNull();
      expect(document.body.querySelector("[data-layout-menu-trigger]")).toBeNull();
      expect(document.body.querySelector("[data-layout-add-ghost]")).toBeNull();
      expect(document.body.querySelector("[data-layout-section-menu-trigger]")).toBeNull();
      expect(document.body.querySelector("[data-authoring-move-handle]")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("emits bounded placement on layout runtime frames when the definition opts in", async () => {
    const editor = new Editor({
      editable: false,
      extensions: [
        createTestNodeIdentityExtension(),
        DocumentNode,
        StarterKit.configure({
          document: false,
          undoRedo: false,
          paragraph: false,
        }),
        ExtendedParagraph,
        CourseDocumentNode,
        createCourseSectionNode(),
        SurfaceNode,
        RegionNode,
        GridRuntimeNode,
        CellRuntimeNode,
        TestLayoutRuntimeNode,
        TestSectionRuntimeNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "page" },
            content: [
              {
                type: "surface",
                attrs: {
                  id: "surfaceRun02",
                  variant: "page-default",
                },
                content: [
                  {
                    type: "layout",
                    attrs: {
                      id: "layoutRun002",
                      variant: "test-bounded-runtime-layout",
                    },
                    content: [runtimeTabSection("sectionRun03", "Bounded")],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector(
            '[data-node="layout"][data-definition="test-bounded-runtime-layout"]',
          ),
        ).not.toBeNull();
      });

      const layoutElement = document.body.querySelector(
        '[data-node="layout"][data-definition="test-bounded-runtime-layout"]',
      );

      expect(layoutElement?.getAttribute("data-bounded-placement")).toBe("fill");
      expect(layoutElement?.getAttribute("data-runtime-frame")).toBe("layout");
    } finally {
      editor.destroy();
    }
  });

  it("dispatches accordion and paginated variants to their runtime views", async () => {
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({
        composition: semanticRuntimeComposition,
      }),
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "page" },
            content: [
              {
                type: "surface",
                attrs: { id: "surfaceRun04", variant: "page-default" },
                content: [
                  accordionLayoutDefinition.createContent({ options: { sections: 1 } }),
                  paginatedLayoutDefinition.createContent({ options: { pages: 1 } }),
                ],
              },
            ],
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(document.body.querySelector(".sc-course-accordion")).not.toBeNull();
        expect(document.body.querySelector(".sc-course-paginated")).not.toBeNull();
      });

      expect(document.body.querySelector(".sc-course-accordion__section")).not.toBeNull();
      expect(document.body.querySelector(".sc-course-paginated__section")).not.toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("uses the generic runtime fallback for an unknown persisted variant", async () => {
    const editor = new Editor({
      editable: false,
      extensions: [
        createTestNodeIdentityExtension(),
        DocumentNode,
        StarterKit.configure({
          document: false,
          undoRedo: false,
          paragraph: false,
        }),
        ExtendedParagraph,
        CourseDocumentNode,
        createCourseSectionNode(),
        SurfaceNode,
        RegionNode,
        GridRuntimeNode,
        CellRuntimeNode,
        LayoutRuntimeNode,
        SectionRuntimeNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "page" },
            content: [
              {
                type: "surface",
                attrs: { id: "surfaceRun05", variant: "page-default" },
                content: [
                  {
                    type: "layout",
                    attrs: { id: "layoutRun004", variant: "persisted-unknown" },
                    content: [
                      {
                        type: "section",
                        attrs: { id: "sectionRun04" },
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Unknown layout content" }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        expect(
          document.body.querySelector(
            '[data-node="layout"][data-definition="persisted-unknown"].sc-layout-runtime',
          ),
        ).not.toBeNull();
      });

      expect(document.body.textContent).toContain("Unknown layout content");
      expect(document.body.querySelector(".sc-course-tabs, .sc-course-accordion")).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});

function runtimeTabSection(id: string, label: string) {
  return {
    type: "section",
    attrs: {
      id,
      role: "tab-panel",
      label,
      options: { label },
    },
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: `${label} content` }],
      },
    ],
  };
}

interface RuntimeSemanticLayoutCase {
  readonly variant: "tabs" | "accordion" | "paginated";
  readonly layoutId: string;
  readonly sectionIds: readonly [string, string, ...string[]];
  readonly allowMultiple?: boolean;
}

function runtimeSemanticLayoutDocument(testCase: RuntimeSemanticLayoutCase): JSONContent {
  const definition =
    testCase.variant === "tabs"
      ? tabsLayoutDefinition
      : testCase.variant === "accordion"
        ? accordionLayoutDefinition
        : paginatedLayoutDefinition;
  const layout = definition.createContent({
    options:
      testCase.variant === "tabs"
        ? { sections: testCase.sectionIds.length }
        : testCase.variant === "accordion"
          ? { sections: testCase.sectionIds.length, allowMultiple: testCase.allowMultiple ?? false }
          : { pages: testCase.sectionIds.length },
  });

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceSemRt", variant: "page-default" },
            content: [
              {
                ...layout,
                attrs: { ...layout.attrs, id: testCase.layoutId },
                content: (layout.content ?? []).map((section, index) => ({
                  ...section,
                  attrs: { ...section.attrs, id: testCase.sectionIds[index] },
                })),
              },
            ],
          },
        ],
      },
    ],
  };
}

function nestedRuntimeTabsDocument(): JSONContent {
  const innerLayout = tabsLayoutDefinition.createContent({ options: { sections: 2 } });
  const identifiedInnerLayout: JSONContent = {
    ...innerLayout,
    attrs: { ...innerLayout.attrs, id: "layoutInnRt1" },
    content: (innerLayout.content ?? []).map((section, index) => ({
      ...section,
      attrs: { ...section.attrs, id: index === 0 ? "innerSectRt1" : "innerSectRt2" },
    })),
  };
  const outerLayout = tabsLayoutDefinition.createContent({ options: { sections: 2 } });
  const identifiedOuterLayout: JSONContent = {
    ...outerLayout,
    attrs: { ...outerLayout.attrs, id: "layoutOutRt1" },
    content: (outerLayout.content ?? []).map((section, index) => ({
      ...section,
      attrs: { ...section.attrs, id: index === 0 ? "outerSectRt1" : "outerSectRt2" },
      ...(index === 1 ? { content: [identifiedInnerLayout] } : {}),
    })),
  };

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceNest1", variant: "page-default" },
            content: [identifiedOuterLayout],
          },
        ],
      },
    ],
  };
}

function runtimePanelId(testCase: RuntimeSemanticLayoutCase, sectionId: string): string {
  if (testCase.variant === "tabs") return tabPanelId(testCase.layoutId, sectionId);
  if (testCase.variant === "accordion") {
    return accordionPanelId(testCase.layoutId, sectionId);
  }
  return paginatedPagePanelId(testCase.layoutId, sectionId);
}

function runtimeControlId(testCase: RuntimeSemanticLayoutCase, sectionId: string): string {
  if (testCase.variant === "tabs") return tabTriggerId(testCase.layoutId, sectionId);
  if (testCase.variant === "accordion") {
    return accordionTriggerId(testCase.layoutId, sectionId);
  }
  return paginatedPageButtonId(testCase.layoutId, sectionId);
}

function environmentRegistryResolution(editor: Editor, layoutId: EmbeddedNodeId) {
  return getSemanticTargetInteractionEnvironmentForEditor(editor).registry.resolve(layoutId);
}

function requireRuntimeSemanticActivationBinding(editor: Editor, layoutId: EmbeddedNodeId) {
  const resolution = environmentRegistryResolution(editor, layoutId);
  if (resolution.kind !== "resolved") {
    throw new Error(`Missing runtime semantic activation binding for ${layoutId}`);
  }
  return resolution.binding;
}

function elementWithIdWithin(root: HTMLElement, id: string): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>("[id]")).find(
      (candidate) => candidate.id === id,
    ) ?? null
  );
}
