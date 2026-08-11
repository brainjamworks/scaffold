// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { LearnerActivitySnapshot } from "@scaffold/contracts";
import type { ScaffoldLearnerPublication } from "@scaffold/core/ports";
import type { ContentRuntimeHostProps, ScaffoldLearnerAppProps } from "@scaffold/core/runtime";

const mocks = vi.hoisted(() => ({
  authoringEntryProps: [] as Array<Record<string, unknown>>,
  runtimeHostProps: [] as ContentRuntimeHostProps[],
  learnerAppProps: [] as ScaffoldLearnerAppProps[],
  moodleCall: vi.fn(),
  saveNow: vi.fn(async () => true),
  scaffoldApplications: [] as Array<{
    runtime: ContentRuntimeHostProps["composition"];
  }>,
}));

vi.mock("@scaffold/core/extensions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scaffold/core/extensions")>();

  return {
    ...actual,
    createScaffoldApplication: () => {
      const application = actual.createScaffoldApplication();
      mocks.scaffoldApplications.push(application);
      return application;
    },
  };
});

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
    const hostHeaderActions = props["hostHeaderActions"];
    const slots =
      typeof hostHeaderActions === "function"
        ? hostHeaderActions({
            preview: false,
            saveNow: mocks.saveNow,
            saveState: "idle",
            title: readyArtifact.title,
          })
        : null;
    return createElement(
      "section",
      { "data-testid": "scaffold-authoring-entry" },
      createElement(
        "header",
        { "data-testid": "shared-header-actions" },
        slots?.beforePublish,
        createElement("button", { type: "button" }, "Core Publish"),
        slots?.afterPublish,
      ),
    );
  },
}));

vi.mock("@scaffold/core/format", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scaffold/core/format")>();
  return {
    ...actual,
    ScaffoldArtifactSchema: {
      safeParse: (value: unknown) => ({ success: true, data: value }),
    },
  };
});

vi.mock("@scaffold/core/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scaffold/core/runtime")>();

  return {
    ...actual,
    ContentRuntimeHost: (props: ComponentProps<typeof actual.ContentRuntimeHost>) => {
      mocks.runtimeHostProps.push(props);
      return createElement(actual.ContentRuntimeHost, props);
    },
    ScaffoldLearnerApp: (props: ScaffoldLearnerAppProps) => {
      mocks.learnerAppProps.push(props);
      return createElement(actual.ScaffoldLearnerApp, props);
    },
  };
});

import { ScaffoldServicesProvider } from "@scaffold/core/runtime";
import { createScaffoldDocumentContent } from "@scaffold/core/format";
import { MoodleApp } from "./MoodleApp";
import { createMoodleRuntimePorts } from "./ports";

type MoodleAppConfig = ComponentProps<typeof MoodleApp>["config"];

const defaultPageAttrs = createScaffoldDocumentContent({
  mode: "page",
  surfaceId: "moodlesurf01",
}).content?.[0]?.attrs;
if (!defaultPageAttrs) throw new Error("Expected default page document attributes");
const MOODLE_SURFACE_ID = "moodlesurf01";
const MOODLE_CHECKLIST_ID = "moodcheck001";
const MOODLE_CHECKLIST_ITEM_ID = "mooditem0001";
const MOODLE_FLASHCARD_ID = "moodflash001";
const MOODLE_FLASHCARD_CARD_ID = "moodcard0001";

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
          ...defaultPageAttrs,
        },
        content: [
          {
            type: "surface",
            attrs: { id: MOODLE_SURFACE_ID, variant: "page-default" },
            content: [
              {
                type: "checklist",
                attrs: {
                  id: MOODLE_CHECKLIST_ID,
                  data: { type: "checklist", showProgress: true, showReset: true },
                },
                content: [
                  {
                    type: "checklist_item",
                    attrs: { id: MOODLE_CHECKLIST_ITEM_ID },
                    content: [
                      {
                        type: "paragraph",
                        attrs: { id: "moodpara0001" },
                        content: [{ type: "text", text: "Complete the Moodle activity" }],
                      },
                    ],
                  },
                ],
              },
              {
                type: "flashcard",
                attrs: {
                  id: MOODLE_FLASHCARD_ID,
                  data: { type: "flashcard", shuffle: false },
                },
                content: [
                  {
                    type: "flashcard_card",
                    attrs: { id: MOODLE_FLASHCARD_CARD_ID },
                    content: [
                      {
                        type: "flashcard_card_front",
                        attrs: { id: "moodfront001" },
                        content: [
                          {
                            type: "paragraph",
                            attrs: { id: "moodpara0002" },
                            content: [{ type: "text", text: "Moodle flashcard front" }],
                          },
                        ],
                      },
                      {
                        type: "flashcard_card_back",
                        attrs: { id: "moodback0001" },
                        content: [
                          {
                            type: "paragraph",
                            attrs: { id: "moodpara0003" },
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
const readyArtifactMetadata = {
  id: readyArtifact.id,
  title: readyArtifact.title,
  mode: readyArtifact.mode,
};
const supportedArtifactAccessJson = JSON.stringify({
  status: "supported",
  artifact: readyArtifactMetadata,
});
const publicationStatus = {
  currentArtifactRevision: "revision-2",
  publishedArtifactRevision: "revision-1",
  publishedAt: "2026-08-09T10:00:00Z",
};

const assessmentSnapshot = {
  snapshotVersion: 2 as const,
  artifactId: readyArtifact.id,
  problems: {},
  quizzes: {},
};

const learnerActivitySnapshot: LearnerActivitySnapshot = {
  snapshotVersion: 1 as const,
  artifactId: readyArtifact.id,
  activities: {
    [MOODLE_CHECKLIST_ID]: {
      activityKind: "checklist",
      data: { checked: {} },
      completed: false,
      updatedAt: null,
    },
    [MOODLE_FLASHCARD_ID]: {
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
    artifactAccessJson: supportedArtifactAccessJson,
    artifactJson: "null",
    assessmentSnapshotJson: JSON.stringify(assessmentSnapshot),
    learnerActivitySnapshotJson: JSON.stringify(learnerActivitySnapshot),
    learnerPublicationJson: JSON.stringify({
      status: "supported",
      learnerContent: readyArtifact.content,
    }),
    publicationStatusJson: JSON.stringify(publicationStatus),
  });
});

afterEach(() => {
  cleanup();
  mocks.authoringEntryProps.length = 0;
  mocks.runtimeHostProps.length = 0;
  mocks.learnerAppProps.length = 0;
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
      artifactAccessJson: supportedArtifactAccessJson,
      artifactJson: JSON.stringify(readyArtifact),
      publicationStatusJson: JSON.stringify(publicationStatus),
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
    expect(mocks.scaffoldApplications).toHaveLength(1);
    expect(props?.["application"]).toBe(mocks.scaffoldApplications[0]);
    expect(props?.["artifact"]).toEqual(readyArtifact);
    expect(props?.["productAccess"]).toEqual({ scaffoldPlusAuthorized: false });
    expect(props?.["services"]).toMatchObject({
      artifactPersistence: { saveArtifact: expect.any(Function) },
      learnerPublication: {
        getStatus: expect.any(Function),
        publish: expect.any(Function),
      },
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
    expect(screen.getByRole("button", { name: "Core Publish" })).toBeInTheDocument();
    expect(props?.["headerActions"]).toBeUndefined();
    const hostHeaderActions = props?.["hostHeaderActions"];
    expect(hostHeaderActions).toBeTypeOf("function");
    const slots = (
      hostHeaderActions as (context: Record<string, unknown>) => Record<string, unknown>
    )({
      preview: false,
      saveNow: mocks.saveNow,
      saveState: "idle",
      title: readyArtifact.title,
    });
    expect(Object.keys(slots)).toEqual(["beforePublish"]);
    expect(slots["afterPublish"]).toBeUndefined();
    expect(mocks.saveNow).not.toHaveBeenCalled();
    expect(screen.queryByRole("navigation", { name: "Scaffold authoring" })).toBeNull();
    expect(mocks.runtimeHostProps).toHaveLength(0);
  });

  it("does not treat a withheld Plus-required artifact as new authoring content", async () => {
    mocks.moodleCall.mockResolvedValue({
      success: true,
      artifactAccessJson: JSON.stringify({
        status: "requires-scaffold-plus",
        artifact: readyArtifactMetadata,
      }),
      artifactJson: "null",
      assessmentSnapshotJson: "null",
    });

    renderMoodleApp(authorConfig);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This course requires Scaffold Plus.",
    );
    expect(mocks.authoringEntryProps).toHaveLength(0);
    expect(screen.queryByTestId("scaffold-authoring-entry")).toBeNull();
    expect(screen.queryByTestId("scaffold-runtime-host")).toBeNull();
  });

  it("preserves the learner runtime branch", async () => {
    renderMoodleApp(baseConfig);

    await waitFor(() => expect(screen.getByTestId("scaffold-runtime-host")).toBeInTheDocument());

    expect(mocks.moodleCall).toHaveBeenCalledWith("mod_scaffold_get_payload", {
      cmid: 42,
      purpose: "learner",
    });

    expect(mocks.learnerAppProps.at(-1)?.bootstrap).toMatchObject({
      artifactId: readyArtifact.id,
      publication: { status: "supported", learnerContent: readyArtifact.content },
      initialLearnerState: {
        assessmentSnapshot,
        learnerActivitySnapshot,
      },
    });
    expect(mocks.learnerAppProps.at(-1)?.productAccess).toEqual({
      scaffoldPlusAuthorized: false,
    });
    expect(mocks.scaffoldApplications).toHaveLength(1);
    expect(mocks.learnerAppProps.at(-1)?.composition).not.toBe(
      mocks.scaffoldApplications[0]?.runtime,
    );
    expect(screen.queryByTestId("scaffold-authoring-entry")).toBeNull();
    expect(screen.queryByRole("link", { name: "Back to activity" })).toBeNull();
  });

  it("consumes a withheld Plus-required learner refusal without reading snapshots", async () => {
    mocks.moodleCall.mockResolvedValue({
      success: true,
      artifactAccessJson: JSON.stringify({
        status: "requires-scaffold-plus",
        artifact: readyArtifactMetadata,
      }),
      artifactJson: "null",
      assessmentSnapshotJson: "not-readable-on-refusal",
      learnerActivitySnapshotJson: "not-readable-on-refusal",
      learnerPublicationJson: JSON.stringify({ status: "requires-scaffold-plus" }),
    });

    renderMoodleApp(baseConfig);

    expect(await screen.findByTestId("scaffold-runtime-unavailable")).toHaveAttribute(
      "data-runtime-unavailable-reason",
      "requires-scaffold-plus",
    );
    expect(mocks.learnerAppProps.at(-1)?.bootstrap).toMatchObject({
      artifactId: readyArtifact.id,
      publication: { status: "requires-scaffold-plus" },
    });
    expect(mocks.learnerAppProps.at(-1)?.bootstrap.initialLearnerState).toEqual({});
    expect(document.body).not.toHaveTextContent("not-readable-on-refusal");
    expect(mocks.authoringEntryProps).toHaveLength(0);
  });

  it("mounts the distinct not-published learner state without canonical draft data", async () => {
    mocks.moodleCall.mockResolvedValue({
      success: true,
      artifactAccessJson: JSON.stringify({
        status: "not-published",
        artifact: { id: readyArtifact.id, title: "Scaffold", mode: "page" },
      }),
      artifactJson: "null",
      assessmentSnapshotJson: "null",
      learnerPublicationJson: JSON.stringify({ status: "not-published" }),
    });

    renderMoodleApp(baseConfig);

    expect(await screen.findByTestId("scaffold-runtime-unavailable")).toHaveAttribute(
      "data-runtime-unavailable-reason",
      "not-published",
    );
    expect(mocks.learnerAppProps.at(-1)?.bootstrap).toMatchObject({
      artifactId: readyArtifact.id,
      title: "Scaffold",
      publication: { status: "not-published" },
    });
    expect(JSON.stringify(mocks.learnerAppProps.at(-1)?.bootstrap)).not.toContain("author-only");
  });

  it.each([
    {
      publication: {
        status: "unavailable-content",
        unavailableContent: [
          {
            kind: "block",
            capabilityId: "plus_private_block",
            stableId: "plusblock001",
            path: ["content", 0],
          },
        ],
      } satisfies ScaffoldLearnerPublication,
      reason: "unavailable-content",
    },
    {
      publication: {
        status: "invalid",
        issues: [{ code: "invalid_document", message: "Invalid document.", path: [] }],
      } satisfies ScaffoldLearnerPublication,
      reason: "invalid-learner-content",
    },
    {
      publication: {
        status: "unsupported-core-format",
        documentVersion: 5,
        supportedVersion: 4,
        message: "Future format.",
      } satisfies ScaffoldLearnerPublication,
      reason: "unsupported-core-format",
    },
  ])("preserves the $publication.status learner refusal", async ({ publication, reason }) => {
    mocks.moodleCall.mockResolvedValue({
      success: true,
      artifactAccessJson: supportedArtifactAccessJson,
      artifactJson: "null",
      assessmentSnapshotJson: JSON.stringify(assessmentSnapshot),
      learnerActivitySnapshotJson: JSON.stringify(learnerActivitySnapshot),
      learnerPublicationJson: JSON.stringify(publication),
    });

    renderMoodleApp(baseConfig);

    expect(await screen.findByTestId("scaffold-runtime-unavailable")).toHaveAttribute(
      "data-runtime-unavailable-reason",
      reason,
    );
    expect(mocks.learnerAppProps.at(-1)?.bootstrap.publication).toEqual(publication);
    expect(mocks.authoringEntryProps).toHaveLength(0);
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
            artifactAccessJson: supportedArtifactAccessJson,
            artifactJson: "null",
            assessmentSnapshotJson: JSON.stringify(assessmentSnapshot),
            learnerActivitySnapshotJson: JSON.stringify(persistedSnapshot),
            learnerPublicationJson: JSON.stringify({
              status: "supported",
              learnerContent: readyArtifact.content,
            }),
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
    await waitFor(() => expect(learnerSaveCalls()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: /^Flip card/ }));

    await waitFor(() => expect(learnerSaveCalls()).toHaveLength(2));
    expect(learnerSaveCalls()).toEqual([
      [
        "mod_scaffold_save_learner_activity",
        {
          cmid: 42,
          artifactid: readyArtifact.id,
          blockid: MOODLE_CHECKLIST_ID,
          recordjson: JSON.stringify({
            activityKind: "checklist",
            data: { checked: { [MOODLE_CHECKLIST_ITEM_ID]: true }, total: 1 },
            completed: true,
          }),
        },
      ],
      [
        "mod_scaffold_save_learner_activity",
        {
          cmid: 42,
          artifactid: readyArtifact.id,
          blockid: MOODLE_FLASHCARD_ID,
          recordjson: JSON.stringify({
            activityKind: "flashcard",
            data: {
              currentCardId: null,
              flipped: { [MOODLE_FLASHCARD_CARD_ID]: true },
              mastery: {},
              total: 1,
            },
            completed: false,
          }),
        },
      ],
    ]);
    expect(persistedSnapshot.activities[MOODLE_CHECKLIST_ID]?.updatedAt).toBe(
      authoritativeTimestamps[0],
    );
    expect(persistedSnapshot.activities[MOODLE_FLASHCARD_ID]?.updatedAt).toBe(
      authoritativeTimestamps[1],
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
    expect(learnerSaveCalls()).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /^Show front/ }));
    await waitFor(() => expect(learnerSaveCalls()).toHaveLength(3));
    expect(learnerSaveCalls().at(-1)).toEqual([
      "mod_scaffold_save_learner_activity",
      {
        cmid: 42,
        artifactid: readyArtifact.id,
        blockid: MOODLE_FLASHCARD_ID,
        recordjson: JSON.stringify({
          activityKind: "flashcard",
          data: {
            currentCardId: null,
            flipped: { [MOODLE_FLASHCARD_CARD_ID]: false },
            mastery: {},
            total: 1,
          },
          completed: false,
        }),
      },
    ]);
  });

  it("passes uninitialized authoring content to the shared creation entry", async () => {
    mocks.moodleCall.mockResolvedValue({
      success: true,
      artifactAccessJson: supportedArtifactAccessJson,
      artifactJson: JSON.stringify({ ...readyArtifact, content: null }),
      publicationStatusJson: JSON.stringify(publicationStatus),
    });

    renderMoodleApp(authorConfig);

    await screen.findByTestId("scaffold-authoring-entry");
    expect(mocks.authoringEntryProps.at(-1)?.["artifact"]).toBeNull();
    const returnLink = screen.getByRole("link", { name: "Back to activity" });
    expect(returnLink.getAttribute("href")).toBe(authorConfig.returnUrl);
    expect(returnLink.getAttribute("target")).toBe("_top");
    expect(screen.getByRole("navigation", { name: "Scaffold authoring" })).toBeInTheDocument();
  });

  it("rejects canonical artifact data on the learner response", async () => {
    mocks.moodleCall.mockResolvedValue({
      success: true,
      artifactAccessJson: supportedArtifactAccessJson,
      artifactJson: JSON.stringify({ ...readyArtifact, content: null }),
    });

    renderMoodleApp({ ...baseConfig, surface: "learner" });

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    expect(screen.queryByTestId("scaffold-authoring-entry")).toBeNull();
  });

  it("rejects malformed learner activity bootstrap before mounting the runtime", async () => {
    mocks.moodleCall.mockResolvedValue({
      success: true,
      artifactAccessJson: supportedArtifactAccessJson,
      artifactJson: "null",
      assessmentSnapshotJson: JSON.stringify(assessmentSnapshot),
      learnerActivitySnapshotJson: JSON.stringify({
        ...learnerActivitySnapshot,
        snapshotVersion: 2,
      }),
    });

    renderMoodleApp(baseConfig);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("scaffold-runtime-host")).toBeNull();
    expect(mocks.learnerAppProps).toHaveLength(0);
  });
});
