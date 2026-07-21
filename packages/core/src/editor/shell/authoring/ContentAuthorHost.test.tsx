// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";

import { COURSE_DOCUMENT_FRAGMENT } from "@/document/model/constants";
import { ScaffoldUnavailableAgentIntegration } from "@/editor/shell/agent/ScaffoldUnavailableAgentIntegration";
import type { ScaffoldAgentIntegrationProps } from "@/editor/shell/agent/agent-integration";
import { useScaffoldArtifactIdentity } from "@/host/providers/ScaffoldArtifactIdentityProvider";

import { ContentAuthorHost } from "./ContentAuthorHost";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ContentAuthorHost", () => {
  it("mounts the editor with the unavailable Agent integration", async () => {
    const document = new Y.Doc();
    const onEditorReady = vi.fn();

    render(
      <ContentAuthorHost
        agentIntegration={ScaffoldUnavailableAgentIntegration}
        artifactId="test-artifact"
        document={document}
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
    expect(document.getXmlFragment(COURSE_DOCUMENT_FRAGMENT).length).toBeGreaterThan(0);
    expect(courseDocument?.attrs).toMatchObject({ mode: "page" });
  });

  it("provides the initial null editor before the live editor without remounting", async () => {
    const document = new Y.Doc();
    const onEditorReady = vi.fn();
    const observedEditors: Array<TiptapEditor | null> = [];

    function TrackingIntegration({ editor, renderWorkspace }: ScaffoldAgentIntegrationProps) {
      observedEditors.push(editor);
      return renderWorkspace({ mode: "editing", dock: null });
    }

    const { container } = render(
      <ContentAuthorHost
        agentIntegration={TrackingIntegration}
        agentOpen={false}
        document={document}
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

  it("gates contributed dock content on readiness, open state, and editability", async () => {
    const document = new Y.Doc();
    const onEditorReady = vi.fn();

    function DockIntegration({ renderWorkspace }: ScaffoldAgentIntegrationProps) {
      return renderWorkspace({
        mode: "editing",
        dock: <aside data-testid="fake-agent-dock">Fake Agent</aside>,
      });
    }

    const { rerender } = render(
      <ContentAuthorHost
        agentIntegration={DockIntegration}
        agentOpen
        document={document}
        onEditorReady={onEditorReady}
      />,
    );

    expect(screen.queryByTestId("fake-agent-dock")).toBeNull();
    await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1));
    await screen.findByTestId("fake-agent-dock");

    rerender(
      <ContentAuthorHost
        agentIntegration={DockIntegration}
        agentOpen={false}
        document={document}
        onEditorReady={onEditorReady}
      />,
    );
    expect(screen.queryByTestId("fake-agent-dock")).toBeNull();

    rerender(
      <ContentAuthorHost
        agentIntegration={DockIntegration}
        agentOpen
        document={document}
        editable={false}
        onEditorReady={onEditorReady}
      />,
    );
    expect(screen.queryByTestId("fake-agent-dock")).toBeNull();
  });

  it("forwards close from a contributed dock", async () => {
    const user = userEvent.setup();
    const document = new Y.Doc();
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
        agentIntegration={ClosableIntegration}
        agentOpen
        document={document}
        onAgentClose={onAgentClose}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Close fake Agent" }));

    expect(onAgentClose).toHaveBeenCalledTimes(1);
  });

  it("suspends and resumes the same editor from the review discriminant", async () => {
    const user = userEvent.setup();
    const document = new Y.Doc();
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
        agentIntegration={ReviewingIntegration}
        agentOpen
        artifactId="review-artifact"
        document={document}
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
