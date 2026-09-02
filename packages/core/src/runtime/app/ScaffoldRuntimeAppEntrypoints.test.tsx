// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import type { ScaffoldLearnerAppProps } from "./ScaffoldLearnerApp";
import type { AuthorPreviewRuntimeMount } from "./ContentRuntimeHost";

const runtimeAppProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("./ScaffoldRuntimeApp", async () => {
  const { createElement } = await import("react");
  return {
    ScaffoldRuntimeApp(props: Record<string, unknown>) {
      runtimeAppProps.push(props);
      return createElement("div", { "data-testid": "scaffold-runtime-app" });
    },
  };
});

import { ScaffoldAuthorPreviewApp } from "./ScaffoldAuthorPreviewApp";
import { ScaffoldLearnerApp } from "./ScaffoldLearnerApp";

const props = {
  bootstrap: {},
  composition: {},
  productAccess: { scaffoldPlusAuthorized: false },
  services: {},
} as unknown as ScaffoldLearnerAppProps;
const authorPreviewRuntimeMount = {
  initialSurfaceId: "surface00001",
  programSource: vi.fn(),
  onPresentationPlaybackPortChange: vi.fn(),
  onLearnerInteractionReportsPortChange: vi.fn(),
} as unknown as AuthorPreviewRuntimeMount;

afterEach(() => {
  cleanup();
  runtimeAppProps.length = 0;
});

describe("runtime app entry points", () => {
  it("fixes learner playback to enforcing Surface-exit blockers", () => {
    render(<ScaffoldLearnerApp {...props} />);

    expect(screen.getByTestId("scaffold-runtime-app")).toBeInTheDocument();
    expect(runtimeAppProps).toHaveLength(1);
    expect(runtimeAppProps[0]?.["surfaceExitPolicy"]).toBe("enforce");
  });

  it("fixes author Preview to observing Surface-exit blockers", () => {
    render(
      <ScaffoldAuthorPreviewApp {...props} authorPreviewRuntimeMount={authorPreviewRuntimeMount} />,
    );

    expect(screen.getByTestId("scaffold-runtime-app")).toBeInTheDocument();
    expect(runtimeAppProps).toHaveLength(1);
    expect(runtimeAppProps[0]?.["surfaceExitPolicy"]).toBe("observe-only");
    expect(runtimeAppProps[0]?.["authorPreviewRuntimeMount"]).toBe(authorPreviewRuntimeMount);
  });

  it("does not expose the Surface-exit policy on learner app props", () => {
    expectTypeOf<
      "surfaceExitPolicy" extends keyof ScaffoldLearnerAppProps ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "presentationPreview" extends keyof ScaffoldLearnerAppProps ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "authorPreviewRuntimeMount" extends keyof ScaffoldLearnerAppProps ? true : false
    >().toEqualTypeOf<false>();
  });
});
