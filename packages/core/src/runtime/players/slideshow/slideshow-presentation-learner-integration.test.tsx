// @vitest-environment happy-dom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import {
  cleanup,
  render as renderTest,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { projectCourseStructure, type SurfaceId } from "@/document/model/course-structure";
import {
  createLearnerInteractionEventKey,
  type CompiledLearnerInteractionRule,
  type CompiledSurfaceLearnerInteractionProgram,
} from "@/runtime/learner-interaction/compiled-learner-interaction-program";
import type { PresentationWaitId } from "@/runtime/presentation/compiled-presentation-program";
import { checkRuntimeDocumentReadiness } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { SlideshowPlayer } from "./SlideshowPlayer";
import type {
  SlideshowSurfaceRuntimeProgram,
  SlideshowSurfaceRuntimeProgramSource,
} from "./slideshow-surface-runtime-composition";
import { deriveRequiredControlBindingOwnerIds } from "./use-slideshow-surface-runtime";

const runtimeComposition = createCoreScaffoldRuntimeComposition();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;
const FIRST_SURFACE_ID = "surfaceCtrl1" as SurfaceId;
const SECOND_SURFACE_ID = "surfaceCtrl2" as SurfaceId;
const TABS_OWNER_ID = "layoutCtrl01" as EmbeddedNodeId;
const OVERVIEW_SECTION_ID = "sectionCtl01" as EmbeddedNodeId;
const PRACTICE_SECTION_ID = "sectionCtl02" as EmbeddedNodeId;

class ResizeObserverStub implements ResizeObserver {
  readonly observe = vi.fn((target: Element) => {
    if (!target.matches(".sc-slideshow-player__viewport, .sc-slideshow-player__stage")) return;
    this.callback(
      [
        {
          target,
          contentRect: { width: 1024, height: 576 },
        } as ResizeObserverEntry,
      ],
      this,
    );
  });
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Slideshow Presentation learner integration", () => {
  it("deduplicates every explicit Control Binding owner without treating reveal targets as owners", () => {
    const whenOwner = "whenOwner001" as EmbeddedNodeId;
    const conditionOwner = "condition001" as EmbeddedNodeId;
    const commandOwner = "commandOwn01" as EmbeddedNodeId;
    const waitOwner = "waitOwner001" as EmbeddedNodeId;
    const cueOwner = "cueOwner0001" as EmbeddedNodeId;
    const revealTarget = "revealTgt001" as EmbeddedNodeId;
    const when = {
      ownerId: whenOwner,
      targetId: "whenTarget01" as EmbeddedNodeId,
      type: "selected",
    } as const;
    const program: SlideshowSurfaceRuntimeProgram = {
      learnerInteractions: {
        surfaceId: FIRST_SURFACE_ID,
        rulesByEvent: new Map([
          [
            createLearnerInteractionEventKey(when),
            [
              {
                id: "owner-derivation-rule",
                when,
                conditions: [
                  {
                    ownerId: conditionOwner,
                    targetId: "conditionT01" as EmbeddedNodeId,
                    key: "selected",
                    operator: "equals",
                    value: true,
                  },
                ],
                commands: [
                  {
                    kind: "target-command",
                    ownerId: commandOwner,
                    targetId: "commandTgt01" as EmbeddedNodeId,
                    type: "select",
                  },
                  { kind: "reveal-target", targetId: revealTarget },
                ],
              },
            ],
          ],
        ]),
      },
      presentation: {
        autoAdvance: false,
        timeline: {
          surfaceId: FIRST_SURFACE_ID,
          durationMs: 100,
          waits: [
            {
              kind: "learner-wait",
              id: "owner-wait" as PresentationWaitId,
              atMs: 0,
              requirement: {
                kind: "state",
                ownerId: waitOwner,
                targetId: "waitTarget01" as EmbeddedNodeId,
                key: "selected",
                equals: true,
              },
            },
            {
              kind: "learner-wait",
              id: "duplicate-wait" as PresentationWaitId,
              atMs: 20,
              requirement: { kind: "event", ...when },
            },
          ],
          cues: [
            {
              id: "owner-cue",
              atMs: 10,
              command: {
                kind: "target-command",
                ownerId: cueOwner,
                targetId: "cueTarget001" as EmbeddedNodeId,
                type: "select",
              },
            },
            {
              id: "duplicate-cue",
              atMs: 30,
              command: {
                kind: "target-command",
                ownerId: commandOwner,
                targetId: "commandTgt01" as EmbeddedNodeId,
                type: "select",
              },
            },
          ],
        },
      },
    };

    expect(deriveRequiredControlBindingOwnerIds(program)).toEqual([
      whenOwner,
      conditionOwner,
      commandOwner,
      waitOwner,
      cueOwner,
    ]);
    expect(deriveRequiredControlBindingOwnerIds(program)).not.toContain(revealTarget);
  });

  it("holds a time-zero Presentation for one committed Tabs learner turn before navigation", async () => {
    const user = userEvent.setup();
    const readyEditors: TiptapEditor[] = [];
    const program = createTabsLearnerWaitProgram();
    const surfaceRuntimeProgramSource: SlideshowSurfaceRuntimeProgramSource = vi.fn((surfaceId) =>
      surfaceId === FIRST_SURFACE_ID ? program : undefined,
    );
    const prepared = prepareSlideshowDocument(tabsSlideshowDocument());

    renderTest(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <SlideshowPlayer
          artifactId="artifact-tabs-learner-wait"
          preparedDocument={prepared.preparedDocument}
          structure={prepared.structure}
          surfaceRuntimeProgramSource={surfaceRuntimeProgramSource}
          onRendererReady={(editor) => readyEditors.push(editor)}
        />
      </CourseThemeProvider>,
    );

    await waitFor(() => expect(readyEditors).toHaveLength(1));
    const next = screen.getByRole("button", { name: "Next slide" });
    await waitFor(() => expect(next).not.toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2");

    await user.click(next);

    await waitFor(() => expect(next).toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const overview = screen.getByRole("tab", { name: "Overview" });
    const practice = screen.getByRole("tab", { name: "Practice" });
    const selectionsWhenNextBecameReady: Array<{
      readonly overview: string | null;
      readonly practice: string | null;
    }> = [];
    const removeNextAttribute = next.removeAttribute.bind(next);
    next.removeAttribute = (name) => {
      if (name === "disabled") {
        selectionsWhenNextBecameReady.push({
          overview: overview.getAttribute("aria-selected"),
          practice: practice.getAttribute("aria-selected"),
        });
      }
      removeNextAttribute(name);
    };

    await user.click(practice);

    await waitFor(() => {
      expect(overview).toHaveAttribute("aria-selected", "true");
      expect(next).not.toBeDisabled();
    });
    Reflect.deleteProperty(next, "removeAttribute");
    expect(selectionsWhenNextBecameReady).toContainEqual({
      overview: "true",
      practice: "false",
    });

    await user.click(next);

    expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
    await waitFor(() => expect(next).not.toBeDisabled());

    await user.click(next);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 of 2"));
    expect(readyEditors).toHaveLength(1);
    expect(surfaceRuntimeProgramSource).toHaveBeenCalledWith(FIRST_SURFACE_ID);
    expect(surfaceRuntimeProgramSource).toHaveBeenCalledWith(SECOND_SURFACE_ID);
  });
});

function createTabsLearnerWaitProgram(): SlideshowSurfaceRuntimeProgram {
  const practiceSelected = {
    ownerId: TABS_OWNER_ID,
    targetId: PRACTICE_SECTION_ID,
    type: "selected",
  } as const;
  const overviewSelected = {
    ownerId: TABS_OWNER_ID,
    targetId: OVERVIEW_SECTION_ID,
    type: "selected",
  } as const;
  const practiceRule: CompiledLearnerInteractionRule = Object.freeze({
    id: "practice-selected-rule",
    when: practiceSelected,
    conditions: Object.freeze([
      {
        ownerId: TABS_OWNER_ID,
        targetId: PRACTICE_SECTION_ID,
        key: "selected",
        operator: "equals",
        value: true,
      },
    ] as const),
    commands: Object.freeze([
      {
        kind: "target-command",
        ownerId: TABS_OWNER_ID,
        targetId: OVERVIEW_SECTION_ID,
        type: "select",
      },
    ] as const),
  });
  const programmaticEventLeakRule: CompiledLearnerInteractionRule = Object.freeze({
    id: "programmatic-event-leak-detector",
    when: overviewSelected,
    conditions: Object.freeze([]),
    commands: Object.freeze([
      {
        kind: "reveal-target",
        targetId: PRACTICE_SECTION_ID,
      },
    ] as const),
  });
  const learnerInteractions: CompiledSurfaceLearnerInteractionProgram = Object.freeze({
    surfaceId: FIRST_SURFACE_ID,
    rulesByEvent: new Map([
      [createLearnerInteractionEventKey(practiceSelected), Object.freeze([practiceRule])],
      [
        createLearnerInteractionEventKey(overviewSelected),
        Object.freeze([programmaticEventLeakRule]),
      ],
    ]),
  });

  return Object.freeze({
    learnerInteractions,
    presentation: Object.freeze({
      autoAdvance: false,
      timeline: Object.freeze({
        surfaceId: FIRST_SURFACE_ID,
        durationMs: 0,
        cues: Object.freeze([
          {
            id: "select-overview-at-start",
            atMs: 0,
            command: {
              kind: "target-command",
              ownerId: TABS_OWNER_ID,
              targetId: OVERVIEW_SECTION_ID,
              type: "select",
            },
          },
        ] as const),
        waits: Object.freeze([
          {
            kind: "learner-wait",
            id: "practice-selected-wait" as PresentationWaitId,
            atMs: 0,
            requirement: { kind: "event", ...practiceSelected },
          },
        ] as const),
      }),
    }),
  });
}

function prepareSlideshowDocument(content: JSONContent) {
  const readiness = checkRuntimeDocumentReadiness(
    content,
    runtimeComposition,
    coreProductAccess,
  );
  if (readiness.status !== "supported") {
    throw new Error(`Expected a prepared Slideshow fixture, received ${readiness.status}.`);
  }
  const structure = projectCourseStructure(readiness.preparedDocument.content);
  if (!structure || structure.mode !== "slideshow") {
    throw new Error("Expected a projected Slideshow fixture.");
  }
  return { preparedDocument: readiness.preparedDocument, structure };
}

function tabsSlideshowDocument(): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    initialCourseSectionTitle: "Introduction",
    surfaceId: FIRST_SURFACE_ID,
  });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Slideshow fixture is missing its courseDocument.");

  courseDocument.content = [
    { type: "courseSection", attrs: { id: "courseSect01", title: "Introduction" } },
    slideWithTabs(),
    {
      type: "surface",
      attrs: {
        id: SECOND_SURFACE_ID,
        variant: "slide-content",
        settings: slideContentSettings(),
      },
      content: [
        {
          type: "slide_title",
          attrs: { id: "titleCtrl002" },
          content: [{ type: "text", text: "Next slide" }],
        },
        {
          type: "region",
          attrs: { id: "regionCtrl02", role: "main" },
          content: [paragraph("paraCtrl0003", "Second Surface")],
        },
      ],
    },
  ];
  return content;
}

function slideWithTabs(): JSONContent {
  return {
    type: "surface",
    attrs: {
      id: FIRST_SURFACE_ID,
      variant: "slide-content",
      settings: slideContentSettings(),
    },
    content: [
      {
        type: "slide_title",
        attrs: { id: "titleCtrl001" },
        content: [{ type: "text", text: "Tabs learner Wait" }],
      },
      {
        type: "region",
        attrs: { id: "regionCtrl01", role: "main" },
        content: [
          {
            type: "layout",
            attrs: {
              id: TABS_OWNER_ID,
              variant: "tabs",
              options: { variant: "default", label: "Lesson sections" },
            },
            content: [
              tabSection(OVERVIEW_SECTION_ID, "Overview", "paraCtrl0001"),
              tabSection(PRACTICE_SECTION_ID, "Practice", "paraCtrl0002"),
            ],
          },
        ],
      },
    ],
  };
}

function tabSection(id: EmbeddedNodeId, label: string, paragraphId: string): JSONContent {
  return {
    type: "section",
    attrs: { id, options: { label } },
    content: [paragraph(paragraphId, label)],
  };
}

function paragraph(id: string, text: string): JSONContent {
  return {
    type: "paragraph",
    attrs: { id },
    content: [{ type: "text", text }],
  };
}

function slideContentSettings() {
  return {
    header: { enabled: false },
    footer: { enabled: false },
    slideTitle: { enabled: true },
  } as const;
}
