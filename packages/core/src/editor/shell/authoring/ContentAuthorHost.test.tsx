// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ScaffoldUnavailableAgentIntegration } from "@/editor/shell/agent/ScaffoldUnavailableAgentIntegration";
import type { ScaffoldAgentIntegrationProps } from "@/editor/shell/agent/agent-integration";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { useScaffoldArtifactIdentity } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";

import { ContentAuthorHost } from "./ContentAuthorHost.test-harness";

const coreAuthoringComposition = createScaffoldApplication().authoring;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ContentAuthorHost", () => {
  it("threads a neutral bottom workspace into the central Stage column", () => {
    const content = createScaffoldDocumentContent({ mode: "page" });

    render(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        content={content}
        bottomWorkspace={<section>Timeline shell content</section>}
      />,
    );

    const workspace = screen.getByRole("region", { name: "Bottom workspace" });
    expect(workspace).toHaveTextContent("Timeline shell content");
    expect(workspace.closest(".sc-editor-stage-column")).not.toBeNull();
  });

  it("shows a neutral Stage preview without disposing the authoring editor or bottom workspace", async () => {
    const content = createScaffoldDocumentContent({
      mode: "slideshow",
      initialCourseSectionTitle: "Presentation",
    });
    const onEditorReady = vi.fn();
    const { rerender } = render(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        content={content}
        bottomWorkspace={<section>Timeline remains mounted</section>}
        onEditorReady={onEditorReady}
      />,
    );
    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    const editor = onEditorReady.mock.calls[0]?.[0] as TiptapEditor;

    rerender(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        content={content}
        bottomWorkspace={<section>Timeline remains mounted</section>}
        onEditorReady={onEditorReady}
        stagePreview={<section aria-label="Isolated presentation preview">Preview runtime</section>}
      />,
    );

    expect(screen.getByRole("region", { name: "Isolated presentation preview" })).toBeVisible();
    expect(screen.getByText("Timeline remains mounted")).toBeVisible();
    expect(editor.isDestroyed).toBe(false);

    rerender(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        content={content}
        bottomWorkspace={<section>Timeline remains mounted</section>}
        onEditorReady={onEditorReady}
      />,
    );
    expect(onEditorReady).toHaveBeenCalledTimes(1);
    expect(editor.isDestroyed).toBe(false);
  });

  it("mounts the editor with the unavailable Agent integration", async () => {
    const content = createScaffoldDocumentContent({ mode: "page" });
    const onEditorReady = vi.fn();

    render(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        artifactId="test-artifact"
        content={content}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));

    const editor = onEditorReady.mock.calls[0]?.[0];
    const courseDocument = editor.getJSON().content?.[0];

    expect(screen.getByTestId("course-document-editor")).toBeInTheDocument();
    expect(screen.getByTestId("content-author-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("authoring-agent-dock")).toBeInTheDocument();
    expect(screen.getByText("not connected")).toBeInTheDocument();
    expect(courseDocument?.attrs).toMatchObject({ mode: "page" });
  });

  it("uses an unscaled viewport overlay host for slideshow authoring", async () => {
    const content = createScaffoldDocumentContent({
      mode: "slideshow",
      initialCourseSectionTitle: "Section",
    });
    const onEditorReady = vi.fn();

    const { container } = render(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        agentOpen={false}
        content={content}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));

    const editorStage = container.querySelector<HTMLElement>(".sc-editor-stage");
    const courseEditor = screen.getByTestId("course-document-editor");

    expect(editorStage).not.toBeNull();
    await waitFor(() => {
      expect(
        courseEditor.querySelector<HTMLElement>(
          ':scope > [data-scaffold-overlay-host][data-kind="viewport"]',
        ),
      ).not.toBeNull();
    });
  });

  it("provides the initial null editor before the live editor without remounting", async () => {
    const content = createScaffoldDocumentContent({ mode: "page" });
    const onEditorReady = vi.fn();
    const observedEditors: Array<TiptapEditor | null> = [];

    function TrackingIntegration({ editor, renderWorkspace }: ScaffoldAgentIntegrationProps) {
      observedEditors.push(editor);
      return renderWorkspace({ mode: "editing", dock: null });
    }

    const { container } = render(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={TrackingIntegration}
        agentOpen={false}
        content={content}
        leftRail={() => <div>Left rail</div>}
        onEditorReady={onEditorReady}
        rightRail={() => <div>Right rail</div>}
      />,
    );

    expect(observedEditors[0]).toBeNull();
    expect(container.querySelectorAll(".sc-editor-rail-slot")).toHaveLength(2);
    expect(container.querySelectorAll(".sc-editor-rail-viewport")).toHaveLength(0);
    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    const liveEditor = onEditorReady.mock.calls[0]?.[0];
    await waitFor(() => expect(observedEditors).toContain(liveEditor));

    expect(container.querySelectorAll(".sc-editor-rail-viewport")).toHaveLength(2);
    expect(liveEditor.isDestroyed).toBe(false);
    expect(onEditorReady).toHaveBeenCalledTimes(1);
  });

  it("applies Course appearance without extending Course scope to the workspace or rails", async () => {
    const content = createScaffoldDocumentContent({ mode: "page" });
    const onEditorReady = vi.fn();

    const { container } = render(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        agentOpen={false}
        content={content}
        courseAppearance="dark"
        leftRail={() => <div>Left rail</div>}
        onEditorReady={onEditorReady}
        rightRail={() => <div>Right rail</div>}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    const courseRoot = container.querySelector(".sc-course");
    const workspace = screen.getByTestId("content-author-workspace");
    const rails = container.querySelectorAll(".sc-editor-rail-viewport");

    expect(courseRoot).toHaveClass("dark", "sc-course-theme-scaffold-flow-v1");
    expect(workspace).not.toHaveClass("sc-course");
    expect(courseRoot?.contains(workspace)).toBe(false);
    expect(rails).toHaveLength(2);
    expect(Array.from(rails).every((rail) => !rail.classList.contains("sc-course"))).toBe(true);
    expect(Array.from(rails).every((rail) => !courseRoot?.contains(rail))).toBe(true);
  });

  it("remounts the editor when the authoring artifact changes", async () => {
    const firstContent = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "firstsurf001",
    });
    const nextContent = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "nextsurf0001",
    });
    const onEditorReady = vi.fn();
    const { rerender } = render(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        artifactId="first-artifact"
        content={firstContent}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    const firstEditor = onEditorReady.mock.calls[0]?.[0] as TiptapEditor;

    rerender(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        artifactId="next-artifact"
        content={nextContent}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(2));
    const nextEditor = onEditorReady.mock.calls[1]?.[0] as TiptapEditor;
    expect(firstEditor.isDestroyed).toBe(true);
    expect(nextEditor).not.toBe(firstEditor);
    const nextCourseDocument = nextEditor.getJSON().content?.[0] as JSONContent | undefined;
    expect(nextCourseDocument?.content?.[0]?.attrs?.["id"]).toBe("nextsurf0001");
  });

  it("starts a fresh editor session only when prepared input identity changes", async () => {
    const content = createScaffoldDocumentContent({ mode: "page" });
    const firstApplication = createScaffoldApplication();
    const nextApplication = createScaffoldApplication();
    const onEditorReady = vi.fn();
    const { rerender } = render(
      <ContentAuthorHost
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        artifactId="stable-artifact"
        composition={firstApplication.authoring}
        content={content}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    const firstEditor = onEditorReady.mock.calls[0]?.[0] as TiptapEditor;

    rerender(
      <ContentAuthorHost
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        artifactId="stable-artifact"
        composition={firstApplication.authoring}
        content={content}
        onEditorReady={onEditorReady}
      />,
    );
    expect(onEditorReady).toHaveBeenCalledTimes(1);
    expect(firstEditor.isDestroyed).toBe(false);

    rerender(
      <ContentAuthorHost
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        artifactId="stable-artifact"
        composition={nextApplication.authoring}
        content={content}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(2));
    expect(firstEditor.isDestroyed).toBe(true);
    expect(onEditorReady.mock.calls[1]?.[0]).not.toBe(firstEditor);
  });

  it("gates contributed dock content on readiness, open state, and editability", async () => {
    const content = createScaffoldDocumentContent({ mode: "page" });
    const onEditorReady = vi.fn();

    function DockIntegration({ renderWorkspace }: ScaffoldAgentIntegrationProps) {
      return renderWorkspace({
        mode: "editing",
        dock: <aside data-testid="fake-agent-dock">Fake Agent</aside>,
      });
    }

    const { rerender } = render(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={DockIntegration}
        agentOpen
        content={content}
        onEditorReady={onEditorReady}
      />,
    );

    expect(screen.queryByTestId("fake-agent-dock")).toBeNull();
    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    await screen.findByTestId("fake-agent-dock");

    rerender(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={DockIntegration}
        agentOpen={false}
        content={content}
        onEditorReady={onEditorReady}
      />,
    );
    expect(screen.queryByTestId("fake-agent-dock")).toBeNull();

    rerender(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={DockIntegration}
        agentOpen
        content={content}
        editable={false}
        onEditorReady={onEditorReady}
      />,
    );
    expect(screen.queryByTestId("fake-agent-dock")).toBeNull();
  });

  it("mounts the authoring navigator beside an independently open Agent dock", async () => {
    const content = createScaffoldDocumentContent({ mode: "page" });
    const onEditorReady = vi.fn();

    function DockIntegration({ renderWorkspace }: ScaffoldAgentIntegrationProps) {
      return renderWorkspace({
        mode: "editing",
        dock: <aside data-testid="fake-agent-dock">Fake Agent</aside>,
      });
    }

    render(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={DockIntegration}
        agentOpen
        authoringNavigatorDock={(editor) => (
          <aside data-editor-ready={!editor.isDestroyed} data-testid="fake-outline-dock">
            Document Outline
          </aside>
        )}
        content={content}
        onEditorReady={onEditorReady}
      />,
    );

    expect(screen.queryByTestId("fake-outline-dock")).toBeNull();
    expect(screen.queryByTestId("fake-agent-dock")).toBeNull();
    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));

    expect(await screen.findByTestId("fake-outline-dock")).toHaveAttribute(
      "data-editor-ready",
      "true",
    );
    expect(screen.getByTestId("fake-agent-dock")).toBeInTheDocument();
  });

  it("forwards close from a contributed dock", async () => {
    const user = userEvent.setup();
    const content = createScaffoldDocumentContent({ mode: "page" });
    const onAgentClose = vi.fn();

    function ClosableIntegration({ onClose, renderWorkspace }: ScaffoldAgentIntegrationProps) {
      return renderWorkspace({
        mode: "editing",
        dock: (
          <button type="button" onClick={onClose}>
            Close fake Agent
          </button>
        ),
      });
    }

    render(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={ClosableIntegration}
        agentOpen
        content={content}
        onAgentClose={onAgentClose}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Close fake Agent" }));

    expect(onAgentClose).toHaveBeenCalledTimes(1);
  });

  it("suspends and resumes the same editor from the review discriminant", async () => {
    const user = userEvent.setup();
    const content = createScaffoldDocumentContent({ mode: "page" });
    const onEditorReady = vi.fn();

    function ReviewStage() {
      const identity = useScaffoldArtifactIdentity();
      return <section>Reviewing {identity.artifactId}</section>;
    }

    function ReviewingIntegration({ renderWorkspace }: ScaffoldAgentIntegrationProps) {
      const [reviewing, setReviewing] = useState(false);
      const dock = reviewing ? (
        <button type="button" onClick={() => setReviewing(false)}>
          Return to editing
        </button>
      ) : (
        <button type="button" onClick={() => setReviewing(true)}>
          Review draft
        </button>
      );

      return renderWorkspace(
        reviewing ? { mode: "review", dock, stage: <ReviewStage /> } : { mode: "editing", dock },
      );
    }

    render(
      <ContentAuthorHost
        composition={coreAuthoringComposition}
        agentIntegration={ReviewingIntegration}
        agentOpen
        artifactId="review-artifact"
        content={content}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    const liveEditor = onEditorReady.mock.calls[0]?.[0];
    await user.click(await screen.findByRole("button", { name: "Review draft" }));

    await waitFor(() => expect(liveEditor.isEditable).toBe(false));
    expect(screen.queryByTestId("course-document-editor")).toBeNull();
    expect(screen.getByText("Reviewing review-artifact")).toBeInTheDocument();
    expect(liveEditor.isDestroyed).toBe(false);

    await user.click(screen.getByRole("button", { name: "Return to editing" }));

    await waitFor(() => expect(liveEditor.isEditable).toBe(true));
    expect(screen.getByTestId("course-document-editor")).toBeInTheDocument();
    expect(screen.queryByText("Reviewing review-artifact")).toBeNull();
    expect(liveEditor.isDestroyed).toBe(false);
    expect(onEditorReady).toHaveBeenCalledTimes(1);
  });
});
