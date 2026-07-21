// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  type LearnerActivitySnapshot,
} from "@scaffold/contracts";
import type { ContentRuntimeHostProps } from "@scaffold/core/runtime";

const mocks = vi.hoisted(() => ({
  authoringEntryProps: [] as Array<Record<string, unknown>>,
  runtimeHostProps: [] as ContentRuntimeHostProps[],
  moodleCall: vi.fn(),
}));

vi.mock("./api", () => ({
  moodleCall: mocks.moodleCall,
  parseJsonField: (value: unknown, fallback: unknown) => {
    if (typeof value !== "string" || !value) return fallback;
    return JSON.parse(value);
  },
}));

vi.mock("@scaffold/core/authoring", () => ({
  CourseDocumentEditor: () =>
    createElement("section", { "data-testid": "manual-course-document-editor" }),
  ScaffoldAuthoringEntry: (props: Record<string, unknown>) => {
    mocks.authoringEntryProps.push(props);
    if (props["artifact"] === null) {
      return createElement("section", { "data-testid": "scaffold-authoring-entry" });
    }
    const headerActions = props["headerActions"];
    const actions =
      typeof headerActions === "function"
        ? headerActions({
            preview: false,
            saveNow: vi.fn(async () => true),
            saveState: "idle",
            title: readyArtifact.title,
          })
        : null;
    return createElement(
      "section",
      { "data-testid": "scaffold-authoring-entry" },
      createElement("header", { "data-testid": "shared-header-actions" }, actions),
    );
  },
}));

vi.mock("@scaffold/core/format", () => ({
  ScaffoldArtifactSchema: {
    safeParse: (value: unknown) => ({ success: true, data: value }),
  },
  prepareScaffoldArtifactForAuthoring: (artifact: typeof readyArtifact) =>
    artifact.content === null
      ? { status: "uninitialized", artifact }
      : { status: "ready", artifact, source: "stored" },
}));

vi.mock("@scaffold/core/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scaffold/core/runtime")>();

  return {
    ...actual,
    ContentRuntimeHost: (props: ComponentProps<typeof actual.ContentRuntimeHost>) => {
      mocks.runtimeHostProps.push(props);
      return createElement(actual.ContentRuntimeHost, props);
    },
  };
});

import { ScaffoldServicesProvider } from "@scaffold/core/runtime";
import { MoodleApp } from "./MoodleApp";
import { createMoodleRuntimePorts } from "./ports";

type MoodleAppConfig = ComponentProps<typeof MoodleApp>["config"];

const readyArtifact = {
  id: "moodle-artifact",
  title: "Moodle course",
  mode: "page" as const,
  content: {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
        },
        content: [
          {
            type: "surface",
            attrs: { id: "moodle-surface", variant: "page-default" },
            content: [
              {
                type: "checklist",
                attrs: {
                  id: "moodle-checklist",
                  data: { type: "checklist", showProgress: true, showReset: true },
                },
                content: [
                  {
                    type: "checklist_item",
                    attrs: { id: "moodle-checklist-item" },
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Complete the Moodle activity" }],
                      },
                    ],
                  },
                ],
              },
              {
                type: "flashcard",
                attrs: {
                  id: "moodle-flashcard",
                  data: { type: "flashcard", shuffle: false },
                },
                content: [
                  {
                    type: "flashcard_card",
                    attrs: { id: "moodle-flashcard-card" },
                    content: [
                      {
                        type: "flashcard_card_front",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Moodle flashcard front" }],
                          },
                        ],
                      },
                      {
                        type: "flashcard_card_back",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Moodle flashcard back" }],
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
    ],
  },
};

const assessmentSnapshot = {
  snapshotVersion: 1 as const,
  artifactId: readyArtifact.id,
  problems: {},
  quizzes: {},
};

const learnerActivitySnapshot: LearnerActivitySnapshot = {
  snapshotVersion: 1 as const,
  artifactId: readyArtifact.id,
  activities: {
    "moodle-checklist": {
      activityKind: "checklist",
      data: { checked: {} },
      completed: false,
      updatedAt: null,
    },
    "moodle-flashcard": {
      activityKind: "flashcard",
      data: { currentCardId: null, flipped: {}, mastery: {} },
      completed: false,
      updatedAt: null,
    },
  },
};

const baseConfig: MoodleAppConfig = {
  cmid: 42,
  scaffoldid: 7,
  surface: "learner",
  wwwroot: "https://moodle.example",
  sesskey: "session-key",
};
const authorConfig: MoodleAppConfig = {
  ...baseConfig,
  surface: "authoring",
  returnUrl: "https://moodle.example/mod/scaffold/view.php?id=42",
};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  mocks.moodleCall.mockResolvedValue({
    success: true,
    artifactJson: JSON.stringify(readyArtifact),
    assessmentSnapshotJson: JSON.stringify(assessmentSnapshot),
    learnerActivitySnapshotJson: JSON.stringify(learnerActivitySnapshot),
  });
});

afterEach(() => {
  cleanup();
  mocks.authoringEntryProps.length = 0;
  mocks.runtimeHostProps.length = 0;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderMoodleApp(config: MoodleAppConfig) {
  if (config.surface === "authoring") {
    return render(<MoodleApp config={config} />);
  }

  return render(
    <ScaffoldServicesProvider ports={createMoodleRuntimePorts(config.cmid)}>
      <MoodleApp config={config} />
    </ScaffoldServicesProvider>,
  );
}

describe("MoodleApp", () => {
  it("passes ready authoring content through the shared entry", async () => {
    mocks.moodleCall.mockResolvedValue({
      success: true,
      artifactJson: JSON.stringify(readyArtifact),
      assessmentSnapshotJson: "not-assessment-json",
      learnerActivitySnapshotJson: "not-learner-activity-json",
    });
    renderMoodleApp(authorConfig);

    await screen.findByTestId("scaffold-authoring-entry");

    expect(mocks.moodleCall).toHaveBeenCalledWith("mod_scaffold_get_payload", {
      cmid: 42,
      purpose: "authoring",
    });

    const props = mocks.authoringEntryProps.at(-1);
    expect(props?.["artifact"]).toEqual(readyArtifact);
    expect(props?.["services"]).toMatchObject({
      artifactPersistence: { saveArtifact: expect.any(Function) },
      media: {
        list: expect.any(Function),
        resolve: expect.any(Function),
        upload: expect.any(Function),
      },
    });
    expect(props?.["scrollModel"]).toBe("contained");
    expect(props?.["mainClassName"]).toBe("sc-moodle-editor-scroll");
    expect(screen.queryByTestId("manual-header")).toBeNull();
    expect(screen.queryByTestId("manual-toolbar")).toBeNull();
    expect(screen.queryByTestId("manual-bubble-menus")).toBeNull();
    expect(screen.queryByTestId("manual-course-document-editor")).toBeNull();
    const returnLink = screen.getByRole("link", { name: "Back to activity" });
    expect(returnLink.getAttribute("href")).toBe(authorConfig.returnUrl);
    expect(returnLink.getAttribute("target")).toBe("_top");
    expect(returnLink.querySelector('[aria-hidden="true"]')?.textContent).toBe("←");
    expect(screen.getByTestId("shared-header-actions").contains(returnLink)).toBe(true);
    expect(screen.queryByRole("navigation", { name: "Scaffold authoring" })).toBeNull();
    expect(mocks.runtimeHostProps).toHaveLength(0);
  });

  it("preserves the learner runtime branch", async () => {
    renderMoodleApp(baseConfig);

    await waitFor(() => expect(screen.getByTestId("scaffold-runtime-host")).toBeInTheDocument());

    expect(mocks.moodleCall).toHaveBeenCalledWith("mod_scaffold_get_payload", {
      cmid: 42,
      purpose: "learner",
    });

    expect(mocks.runtimeHostProps.at(-1)).toMatchObject({
      artifactId: readyArtifact.id,
      initialAssessmentSnapshot: assessmentSnapshot,
      initialLearnerActivitySnapshot: learnerActivitySnapshot,
      initialContent: readyArtifact.content,
    });
    expect(screen.queryByTestId("scaffold-authoring-entry")).toBeNull();
    expect(screen.queryByRole("link", { name: "Back to activity" })).toBeNull();
  });

  it("persists checklist and flashcard progress and resumes it on a fresh mount", async () => {
    const user = userEvent.setup();
    let persistedSnapshot = structuredClone(learnerActivitySnapshot);
    const authoritativeTimestamps = [
      "2026-07-17T14:20:00Z",
      "2026-07-17T14:20:01Z",
      "2026-07-17T14:20:02Z",
      "2026-07-17T14:20:03Z",
    ];
    let saveIndex = 0;
    mocks.moodleCall.mockImplementation(
      async (methodName: string, args: Record<string, unknown>) => {
        if (methodName === "mod_scaffold_get_payload") {
          return {
            success: true,
            artifactJson: JSON.stringify(readyArtifact),
            assessmentSnapshotJson: JSON.stringify(assessmentSnapshot),
            learnerActivitySnapshotJson: JSON.stringify(persistedSnapshot),
          };
        }
        if (methodName === "mod_scaffold_save_learner_activity") {
          const blockId = String(args["blockid"]);
          const requestedRecord = JSON.parse(String(args["recordjson"]));
          const updatedAt = authoritativeTimestamps[saveIndex];
          if (!updatedAt) throw new Error("Test exhausted authoritative timestamps");
          const authoritativeRecord = {
            ...requestedRecord,
            updatedAt,
          };
          saveIndex += 1;
          persistedSnapshot = {
            ...persistedSnapshot,
            activities: {
              ...persistedSnapshot.activities,
              [blockId]: authoritativeRecord,
            },
          };
          return { success: true, recordJson: JSON.stringify(authoritativeRecord) };
        }
        throw new Error(`Unexpected Moodle call: ${methodName}`);
      },
    );

    const firstMount = renderMoodleApp(baseConfig);
    const checkbox = await screen.findByRole("checkbox", { name: "Mark item as complete" });
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("group", { name: "Card, front showing" })).toBeInTheDocument();

    const learnerSaveCalls = () =>
      mocks.moodleCall.mock.calls.filter(
        ([methodName]) => methodName === "mod_scaffold_save_learner_activity",
      );
    await user.click(checkbox);
    await waitFor(() => expect(learnerSaveCalls()).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: /^Flip card/ }));

    await waitFor(() => expect(learnerSaveCalls()).toHaveLength(3));
    expect(learnerSaveCalls()).toEqual([
      [
        "mod_scaffold_save_learner_activity",
        {
          cmid: 42,
          artifactid: readyArtifact.id,
          blockid: "moodle-checklist",
          recordjson: JSON.stringify({
            activityKind: "checklist",
            data: { checked: { "moodle-checklist-item": true } },
            completed: false,
          }),
        },
      ],
      [
        "mod_scaffold_save_learner_activity",
        {
          cmid: 42,
          artifactid: readyArtifact.id,
          blockid: "moodle-checklist",
          recordjson: JSON.stringify({
            activityKind: "checklist",
            data: { checked: { "moodle-checklist-item": true } },
            completed: true,
          }),
        },
      ],
      [
        "mod_scaffold_save_learner_activity",
        {
          cmid: 42,
          artifactid: readyArtifact.id,
          blockid: "moodle-flashcard",
          recordjson: JSON.stringify({
            activityKind: "flashcard",
            data: {
              currentCardId: null,
              flipped: { "moodle-flashcard-card": true },
              mastery: {},
            },
            completed: false,
          }),
        },
      ],
    ]);
    expect(persistedSnapshot.activities["moodle-checklist"]?.updatedAt).toBe(
      authoritativeTimestamps[1],
    );
    expect(persistedSnapshot.activities["moodle-flashcard"]?.updatedAt).toBe(
      authoritativeTimestamps[2],
    );
    expect(mocks.moodleCall).not.toHaveBeenCalledWith(
      "mod_scaffold_load_learner_activity",
      expect.anything(),
    );

    firstMount.unmount();
    renderMoodleApp(baseConfig);

    const restoredCheckbox = await screen.findByRole("checkbox", {
      name: "Mark item as not complete",
    });
    expect(restoredCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("group", { name: "Card, back showing" })).toBeInTheDocument();
    expect(learnerSaveCalls()).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: /^Show front/ }));
    await waitFor(() => expect(learnerSaveCalls()).toHaveLength(4));
    expect(learnerSaveCalls().at(-1)).toEqual([
      "mod_scaffold_save_learner_activity",
      {
        cmid: 42,
        artifactid: readyArtifact.id,
        blockid: "moodle-flashcard",
        recordjson: JSON.stringify({
          activityKind: "flashcard",
          data: {
            currentCardId: null,
            flipped: { "moodle-flashcard-card": false },
            mastery: {},
          },
          completed: false,
        }),
      },
    ]);
  });

  it("passes uninitialized authoring content to the shared creation entry", async () => {
    mocks.moodleCall.mockResolvedValue({
      success: true,
      artifactJson: JSON.stringify({ ...readyArtifact, content: null }),
    });

    renderMoodleApp(authorConfig);

    await screen.findByTestId("scaffold-authoring-entry");
    expect(mocks.authoringEntryProps.at(-1)?.["artifact"]).toBeNull();
    const returnLink = screen.getByRole("link", { name: "Back to activity" });
    expect(returnLink.getAttribute("href")).toBe(authorConfig.returnUrl);
    expect(returnLink.getAttribute("target")).toBe("_top");
    expect(screen.getByRole("navigation", { name: "Scaffold authoring" })).toBeInTheDocument();
  });

  it("does not mount an authoring entry for uninitialized learner content", async () => {
    mocks.moodleCall.mockResolvedValue({
      success: true,
      artifactJson: JSON.stringify({ ...readyArtifact, content: null }),
    });

    renderMoodleApp({ ...baseConfig, surface: "learner" });

    await screen.findByRole("alert");
    expect(screen.queryByTestId("scaffold-authoring-entry")).toBeNull();
  });

  it("rejects malformed learner activity bootstrap before mounting the runtime", async () => {
    mocks.moodleCall.mockResolvedValue({
      success: true,
      artifactJson: JSON.stringify(readyArtifact),
      assessmentSnapshotJson: JSON.stringify(assessmentSnapshot),
      learnerActivitySnapshotJson: JSON.stringify({
        ...learnerActivitySnapshot,
        snapshotVersion: 2,
      }),
    });

    renderMoodleApp(baseConfig);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("scaffold-runtime-host")).toBeNull();
    expect(mocks.runtimeHostProps).toHaveLength(0);
  });
});
