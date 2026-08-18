// @vitest-environment jsdom

import { Editor, type JSONContent } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { Result } from "better-result";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";
import {
  AppNotificationsProvider,
  useAppNotifications,
  type AppNotificationId,
  type AppNotifications,
} from "@/ui/components/app/AppNotifications/AppNotifications";

import {
  ContentLayoutBubbleControls,
  ContentLayoutBubbleControlsView,
  contentLayoutAuthoringIssueMessage,
} from "./ContentLayoutBubbleControls";
import type {
  ContentLayoutAuthoringIssue,
  ContentLayoutAuthoringNavigation,
} from "./content-layout-authoring-commands";

const FLOW = PresentationContentLayout.Flow;
const SEQUENCE = PresentationContentLayout.Sequence;

const IDS = Object.freeze({
  region: id("region000001"),
  first: id("para00000001"),
  second: id("para00000002"),
  third: id("para00000003"),
  surface: id("surface00001"),
  slideTitle: id("slidetitle01"),
});

const editors: Editor[] = [];
let capturedNotifications: AppNotifications | null = null;

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
  capturedNotifications = null;
  vi.restoreAllMocks();
});

describe("ContentLayoutBubbleControls", () => {
  it("renders Flow and Sequence and navigates live children through stable IDs", async () => {
    const editor = await createRegionEditor({
      contentLayout: FLOW,
      children: [paragraph(IDS.first, "First"), paragraph(IDS.second, "Second")],
    });
    const user = userEvent.setup();
    renderControls(editor);

    expect(screen.getByRole("radio", { name: "Flow" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sequence" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Previous/ })).toBeNull();

    const setLayout = vi.spyOn(
      await import("./content-layout-authoring-commands"),
      "setAuthoringContentLayout",
    );
    const navigate = vi.spyOn(
      await import("./content-layout-authoring-commands"),
      "navigateAuthoringContentLayoutChild",
    );

    await user.click(screen.getByRole("radio", { name: "Sequence" }));
    await waitFor(() => expect(screen.getByText("1 of 2")).toBeInTheDocument());
    expect(setLayout).toHaveBeenCalledWith({
      editor,
      containerId: IDS.region,
      contentLayout: SEQUENCE,
    });

    const previous = screen.getByRole("button", { name: /Previous/ });
    const next = screen.getByRole("button", { name: /Next/ });
    expect(previous).toBeDisabled();
    expect(next).not.toBeDisabled();

    await user.click(next);
    await waitFor(() => expect(screen.getByText("2 of 2")).toBeInTheDocument());
    expect(navigate).toHaveBeenCalledWith({
      editor,
      containerId: IDS.region,
      childId: IDS.second,
    });
    expect(previous).not.toBeDisabled();
    expect(next).toBeDisabled();

    await user.click(previous);
    await waitFor(() => expect(screen.getByText("1 of 2")).toBeInTheDocument());
    expect(navigate).toHaveBeenLastCalledWith({
      editor,
      containerId: IDS.region,
      childId: IDS.first,
    });
  });

  it("keeps the ordinal and disabled boundaries correct for first, middle and last", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [
        paragraph(IDS.first, "First"),
        paragraph(IDS.second, "Second"),
        paragraph(IDS.third, "Third"),
      ],
    });
    const user = userEvent.setup();
    renderControls(editor);

    const previous = screen.getByRole("button", { name: /Previous/ });
    const next = screen.getByRole("button", { name: /Next/ });
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(previous).toBeDisabled();
    expect(next).not.toBeDisabled();

    await user.click(next);
    await waitFor(() => expect(screen.getByText("2 of 3")).toBeInTheDocument());
    expect(previous).not.toBeDisabled();
    expect(next).not.toBeDisabled();

    await user.click(next);
    await waitFor(() => expect(screen.getByText("3 of 3")).toBeInTheDocument());
    expect(previous).not.toBeDisabled();
    expect(next).toBeDisabled();
  });

  it("renders a blank Region Sequence as its real child, 1 of 1", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [paragraph(IDS.first)],
    });
    renderControls(editor);

    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(screen.queryByText("0 of 0")).toBeNull();
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
  });

  it("renders defensive zero-child state as unavailable disabled navigation", () => {
    const navigation: ContentLayoutAuthoringNavigation = {
      kind: "empty",
      containerId: IDS.region,
      activeChildId: null,
      ordinal: null,
      count: 0,
      previous: { kind: "disabled", reason: "empty" },
      next: { kind: "disabled", reason: "empty" },
    };

    render(
      <Tooltip.Provider delayDuration={0}>
        <ContentLayoutBubbleControlsView
          contentLayout={SEQUENCE}
          navigation={navigation}
          onLayoutChange={vi.fn()}
          onNavigate={vi.fn()}
        />
      </Tooltip.Provider>,
    );

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("0 of 0")).toBeNull();
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
  });

  it("prevents mousedown from moving editor selection before controls run", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [paragraph(IDS.first, "First"), paragraph(IDS.second, "Second")],
    });
    renderControls(editor);

    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    const next = screen.getByRole("button", { name: /Next/ });
    fireEvent(next, event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("routes expected command failures to the app notification owner", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [paragraph(IDS.first, "First"), paragraph(IDS.second, "Second")],
    });
    const user = userEvent.setup();
    const commands = await import("./content-layout-authoring-commands");
    const notificationsIssue = {
      kind: "layout-change-rejected" as const,
      issue: {
        code: "incompatible_flow_placement" as const,
        containerId: IDS.region,
        blockingChildIds: [IDS.first, IDS.second],
      },
    };
    vi.spyOn(commands, "setAuthoringContentLayout").mockReturnValue(Result.err(notificationsIssue));

    render(
      <Tooltip.Provider delayDuration={0}>
        <AppNotificationsProvider appearance="light">
          <NotificationProbe />
          <ContentLayoutBubbleControls containerId={IDS.region} editor={editor} />
        </AppNotificationsProvider>
      </Tooltip.Provider>,
    );
    await waitFor(() => expect(capturedNotifications).not.toBeNull());
    const notify = vi
      .spyOn(capturedNotifications!, "notify")
      .mockReturnValue("test-notification" as AppNotificationId);

    await user.click(screen.getByRole("radio", { name: "Flow" }));

    expect(notify).toHaveBeenCalledWith(
      "warning",
      "Flow is unavailable while this container has multiple fill children.",
    );
  });

  it.each([
    [
      { kind: "container-unavailable", containerId: IDS.region },
      "This container is no longer available.",
    ],
    [
      { kind: "child-unavailable", containerId: IDS.region, childId: IDS.first },
      "That content is no longer available.",
    ],
    [
      { kind: "child-not-direct", containerId: IDS.region, childId: IDS.first },
      "That content belongs to a nested sequence.",
    ],
    [
      { kind: "navigation-unavailable", childId: IDS.first },
      "That content cannot be selected right now.",
    ],
    [
      {
        kind: "layout-change-rejected",
        issue: {
          code: "missing_node",
          containerId: IDS.region,
        },
      },
      "This container is no longer available.",
    ],
    [
      {
        kind: "layout-change-rejected",
        issue: {
          code: "duplicate_node_id",
          containerId: IDS.region,
        },
      },
      "This container has duplicate content IDs and cannot change layout.",
    ],
    [
      {
        kind: "layout-change-rejected",
        issue: {
          code: "wrong_node_type",
          containerId: IDS.region,
          actualNodeType: "paragraph",
        },
      },
      "This container cannot change layout.",
    ],
    [
      { kind: "layout-change-rejected", issue: { code: "invalid_settings_value", value: "bad" } },
      "That layout choice is unavailable.",
    ],
    [
      {
        kind: "layout-change-rejected",
        issue: {
          code: "incompatible_flow_placement",
          containerId: IDS.region,
          blockingChildIds: [IDS.first, IDS.second],
        },
      },
      "Flow is unavailable while this container has multiple fill children.",
    ],
  ] as const)("maps expected issue %j to author-facing warning copy", (issue, message) => {
    expect(contentLayoutAuthoringIssueMessage(issue as ContentLayoutAuthoringIssue)).toBe(message);
  });

  it("keeps impossible issue variants observable instead of swallowing them", () => {
    expect(() =>
      contentLayoutAuthoringIssueMessage({
        kind: "unexpected",
      } as unknown as ContentLayoutAuthoringIssue),
    ).toThrow(/Unexpected Content Layout authoring value/);
  });
});

function renderControls(editor: Editor) {
  return render(
    <Tooltip.Provider delayDuration={0}>
      <AppNotificationsProvider appearance="light">
        <ContentLayoutBubbleControls containerId={IDS.region} editor={editor} />
      </AppNotificationsProvider>
    </Tooltip.Provider>,
  );
}

function NotificationProbe() {
  capturedNotifications = useAppNotifications();
  return null;
}

async function createRegionEditor({
  contentLayout,
  children,
}: {
  readonly contentLayout: PresentationContentLayout;
  readonly children: readonly JSONContent[];
}): Promise<Editor> {
  const composition = createCoreScaffoldAuthoringComposition();
  const editor = new Editor({
    editable: true,
    extensions: [
      ...createCourseDocumentAuthoringExtensions({
        editable: true,
        composition,
      }),
      UndoRedo,
    ],
    content: createDocument({ contentLayout, children }),
  });
  editors.push(editor);
  await flushMicrotasks();
  return editor;
}

function createDocument({
  contentLayout,
  children,
}: {
  readonly contentLayout: PresentationContentLayout;
  readonly children: readonly JSONContent[];
}): JSONContent {
  const content = createScaffoldDocumentContent({
    initialCourseSectionTitle: "Content layout controls",
    mode: "slideshow",
    surfaceId: IDS.surface,
  });
  const courseDocument = content.content?.[0];
  const courseSection = courseDocument?.content?.[0];
  if (!courseDocument || courseDocument.type !== "courseDocument" || !courseSection) {
    throw new Error("Expected a generated slideshow Course Document");
  }
  courseDocument.content = [
    courseSection,
    {
      type: "surface",
      attrs: {
        id: IDS.surface,
        settings: {
          footer: { enabled: false },
          header: { enabled: false },
          slideTitle: { enabled: true },
        },
        variant: "slide-content",
      },
      content: [
        { type: "slide_title", attrs: { id: IDS.slideTitle } },
        {
          type: "region",
          attrs: { contentLayout, id: IDS.region, role: "main" },
          content: [...children],
        },
      ],
    },
  ];
  return content;
}

function paragraph(id: EmbeddedNodeId, text = ""): JSONContent {
  return {
    type: "paragraph",
    attrs: { id },
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
