// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import {
  ProcessFlowContent,
  ProcessFlowNumber,
  ProcessFlowTrack,
  readRequiredProcessFlowNodeId,
  readProcessFlowOptions,
} from "./process-flow-components";

describe("process flow shared components", () => {
  it("reads persisted options and falls back to defaults", () => {
    expect(
      readProcessFlowOptions({
        showNumbers: true,
        showConnectors: false,
        orientation: "vertical",
      }),
    ).toEqual({
      showNumbers: true,
      showConnectors: false,
      orientation: "vertical",
    });
    expect(readProcessFlowOptions({})).toEqual({
      showNumbers: false,
      showConnectors: true,
      orientation: "horizontal",
    });
  });

  it("renders the shared track wrapper", () => {
    const { container } = render(
      <ProcessFlowTrack>
        <p>Step list</p>
      </ProcessFlowTrack>,
    );

    expect(screen.getByText("Step list")).toBeInTheDocument();
    const surface = container.querySelector(".sc-process-flow");
    expect(surface).toBeInTheDocument();
    expect(surface?.classList.contains("sc-process-flow__track")).toBe(true);
  });

  it("requires stable node ids", () => {
    expect(readRequiredProcessFlowNodeId("layout-1", "layout")).toBe("layout-1");
    expect(() => readRequiredProcessFlowNodeId("", "section")).toThrow(
      "section node is missing a stable id.",
    );
  });

  it("renders the shared number band", () => {
    const { container } = render(<ProcessFlowNumber value={3} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(container.querySelector(".sc-process-flow__number")).not.toBeNull();
    expect(container.querySelector(".sc-process-flow__number-value")).not.toBeNull();
  });

  it("renders the shared content wrapper", () => {
    const { container } = render(
      <ProcessFlowContent>
        <p>Step content</p>
      </ProcessFlowContent>,
    );

    expect(screen.getByText("Step content")).toBeInTheDocument();
    expect(container.querySelector(".sc-process-flow__content")).not.toBeNull();
  });
});
