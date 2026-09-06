// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@/format/artifact";

import type { ActiveAuthorPreview } from "./author-preview-session-controller";
import { AuthorPreviewStage } from "./AuthorPreviewStage";

const runtimeProps: Record<string, unknown>[] = [];
const mounts: number[] = [];
const unmounts: number[] = [];

vi.mock("@/runtime/app/ScaffoldAuthorPreviewApp", () => ({
  createSlideshowRuntimeProgramSource: vi.fn(),
  ScaffoldAuthorPreviewApp(props: Record<string, unknown>) {
    runtimeProps.push(props);
    const entryId = (props.bootstrap as { title: string }).title === "Entry two" ? 2 : 1;
    useEffect(() => {
      mounts.push(entryId);
      return () => {
        unmounts.push(entryId);
      };
    }, [entryId]);
    return <div data-testid="author-preview-runtime" />;
  },
}));

describe("AuthorPreviewStage", () => {
  beforeEach(() => {
    runtimeProps.length = 0;
    mounts.length = 0;
    unmounts.length = 0;
  });

  it("keeps the course attempt mounted across a runtime generation and binds that generation", async () => {
    const connectPresentationPlayback = vi.fn();
    const connectLearnerInteractionReports = vi.fn();
    const session = {
      connectPresentationPlayback,
      connectLearnerInteractionReports,
      showSurface: vi.fn(),
    };
    const first = active(1, 1);
    const rendered = render(
      <AuthorPreviewStage
        active={first}
        executionEnabled
        artifactId="artifact-preview"
        title="Entry one"
        mode="page"
        composition={{} as never}
        hostColorMode="light"
        productAccess={{} as never}
        session={session}
      />,
    );
    await screen.findByTestId("author-preview-runtime");
    expect(mounts).toEqual([1]);
    const firstMount = runtimeProps.at(-1)?.["authorPreviewRuntimeMount"] as {
      executionEnabled: boolean;
      onSurfaceChangeRequest(surfaceId: string): void;
      onPresentationPlaybackPortChange(port: unknown): void;
    };
    expect(firstMount.executionEnabled).toBe(true);
    firstMount.onSurfaceChangeRequest("surface00002");
    expect(session.showSurface).toHaveBeenCalledWith("surface00002");
    firstMount.onPresentationPlaybackPortChange(null);
    expect(connectPresentationPlayback).toHaveBeenLastCalledWith(1, null);

    rendered.rerender(
      <AuthorPreviewStage
        active={active(1, 2)}
        executionEnabled={false}
        artifactId="artifact-preview"
        title="Entry one"
        mode="page"
        composition={{} as never}
        hostColorMode="light"
        productAccess={{} as never}
        session={session}
      />,
    );
    expect(mounts).toEqual([1]);
    expect(unmounts).toEqual([]);
    const refreshedMount = runtimeProps.at(-1)?.["authorPreviewRuntimeMount"] as {
      executionEnabled: boolean;
      onLearnerInteractionReportsPortChange(port: unknown): void;
    };
    expect(refreshedMount.executionEnabled).toBe(false);
    refreshedMount.onLearnerInteractionReportsPortChange(null);
    expect(connectLearnerInteractionReports).toHaveBeenLastCalledWith(2, null);
  });

  it("replaces the course attempt only for a new explicit entry", async () => {
    const session = {
      connectPresentationPlayback: vi.fn(),
      connectLearnerInteractionReports: vi.fn(),
      showSurface: vi.fn(),
    };
    const rendered = render(
      <AuthorPreviewStage
        active={active(1, 1)}
        executionEnabled
        artifactId="artifact-preview"
        title="Entry one"
        mode="page"
        composition={{} as never}
        hostColorMode="light"
        productAccess={{} as never}
        session={session}
      />,
    );
    await screen.findByTestId("author-preview-runtime");
    rendered.rerender(
      <AuthorPreviewStage
        active={active(2, 2)}
        executionEnabled
        artifactId="artifact-preview"
        title="Entry two"
        mode="page"
        composition={{} as never}
        hostColorMode="light"
        productAccess={{} as never}
        session={session}
      />,
    );
    expect(mounts).toEqual([1, 2]);
    expect(unmounts).toEqual([1]);
  });
});

function active(entryId: number, runtimeGeneration: number): ActiveAuthorPreview {
  return {
    entryId,
    runtimeGeneration,
    surfaceId: "surface00001" as ActiveAuthorPreview["surfaceId"],
    content: {
      learnerContent: createScaffoldDocumentContent({ mode: "page", surfaceId: "surface00001" }),
      assessmentGroups: [],
      assessmentTargets: [],
    },
    services: {} as ActiveAuthorPreview["services"],
    program: null,
  };
}
