// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import type { AlignmentTargetSnapshot } from "@/editor/interactions/alignment/alignment-target";

import { AlignmentControls } from "./AlignmentControls";

const target = { id: "block-a", kind: InteractionTargetKind.Block };

function renderControls(
  snapshot: AlignmentTargetSnapshot,
  callbacks: {
    onHorizontalChange?: (value: "left" | "center" | "right") => void;
    onVerticalChange?: (value: "top" | "middle" | "bottom") => void;
  } = {},
) {
  return render(
    <Tooltip.Provider>
      <AlignmentControls snapshot={snapshot} {...callbacks} />
    </Tooltip.Provider>,
  );
}

describe("AlignmentControls", () => {
  it("renders accessible horizontal and vertical options with active values", () => {
    renderControls({
      target,
      horizontal: { kind: "value", value: "center" },
      vertical: { kind: "value", value: "bottom" },
    });

    expect(screen.getByRole("radiogroup", { name: "Horizontal alignment" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Vertical alignment" })).toBeInTheDocument();
    expect(
      screen
        .getByRole("radio", { name: "Horizontal alignment: Center" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("radio", { name: "Vertical alignment: Bottom" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByRole("radio", { name: "Horizontal alignment: Left" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Horizontal alignment: Right" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Vertical alignment: Top" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Vertical alignment: Middle" })).toBeInTheDocument();
  });

  it("hides unavailable axes", () => {
    renderControls({
      target,
      horizontal: { kind: "unavailable" },
      vertical: { kind: "unavailable" },
    });

    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it.each([
    ["mixed", "Horizontal alignment (mixed)"],
    ["outside-command-set", "Horizontal alignment (outside available options)"],
  ] as const)("labels %s state distinctly without selecting an option", (reason, label) => {
    renderControls({
      target,
      horizontal: { kind: "indeterminate", reason },
      vertical: { kind: "unavailable" },
    });

    expect(screen.getByRole("radiogroup", { name: label })).toBeInTheDocument();
    for (const option of ["Left", "Center", "Right"]) {
      expect(
        screen.getByRole("radio", { name: `${label}: ${option}` }).getAttribute("aria-checked"),
      ).toBe("false");
    }
  });

  it("routes horizontal and vertical activations to their callbacks", async () => {
    const onHorizontalChange = vi.fn();
    const onVerticalChange = vi.fn();
    renderControls(
      {
        target,
        horizontal: { kind: "value", value: "left" },
        vertical: { kind: "value", value: "top" },
      },
      { onHorizontalChange, onVerticalChange },
    );

    await userEvent.click(screen.getByRole("radio", { name: "Horizontal alignment: Right" }));
    await userEvent.click(screen.getByRole("radio", { name: "Vertical alignment: Middle" }));

    expect(onHorizontalChange).toHaveBeenCalledWith("right");
    expect(onVerticalChange).toHaveBeenCalledWith("middle");
  });
});
