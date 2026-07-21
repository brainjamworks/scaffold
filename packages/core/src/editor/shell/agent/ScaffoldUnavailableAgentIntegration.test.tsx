// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ScaffoldAgentWorkspaceContribution } from "./agent-integration";
import { ScaffoldUnavailableAgentIntegration } from "./ScaffoldUnavailableAgentIntegration";

describe("ScaffoldUnavailableAgentIntegration", () => {
  it("contributes editing while the editor is null", () => {
    const contributions: ScaffoldAgentWorkspaceContribution[] = [];

    render(
      <ScaffoldUnavailableAgentIntegration
        artifactId={null}
        editor={null}
        editable={false}
        onClose={vi.fn()}
        renderWorkspace={(contribution) => {
          contributions.push(contribution);
          return <main>{contribution.dock}</main>;
        }}
      />,
    );

    expect(contributions).toHaveLength(1);
    const contribution = contributions[0];
    expect(contribution).toEqual(
      expect.objectContaining({
        mode: "editing",
        dock: expect.anything(),
      }),
    );
    expect(contribution).not.toHaveProperty("stage");
    expect(screen.getByRole("complementary", { name: "Scaffold Agent" })).toBeInTheDocument();
  });

  it("keeps the editing contribution across artifact and editability changes", () => {
    const contributions: ScaffoldAgentWorkspaceContribution[] = [];
    const renderWorkspace = (contribution: ScaffoldAgentWorkspaceContribution) => {
      contributions.push(contribution);
      return <main>{contribution.dock}</main>;
    };
    const onClose = vi.fn();
    const { rerender } = render(
      <ScaffoldUnavailableAgentIntegration
        artifactId={null}
        editor={null}
        editable={false}
        onClose={onClose}
        renderWorkspace={renderWorkspace}
      />,
    );

    rerender(
      <ScaffoldUnavailableAgentIntegration
        artifactId="artifact-1"
        editor={null}
        editable
        onClose={onClose}
        renderWorkspace={renderWorkspace}
      />,
    );

    expect(contributions).toHaveLength(2);
    expect(contributions.map(({ mode }) => mode)).toEqual(["editing", "editing"]);
  });

  it("forwards close from the unavailable dock", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ScaffoldUnavailableAgentIntegration
        artifactId="artifact-1"
        editor={null}
        editable
        onClose={onClose}
        renderWorkspace={(contribution) => <main>{contribution.dock}</main>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close Scaffold Agent" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
