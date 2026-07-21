// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { SCAFFOLD_TEXT_COLOR_OPTIONS } from "./color-options";
import { FullColorPicker } from "./ColorPicker";

describe("FullColorPicker", () => {
  it("includes standard colour names in the shared palette", () => {
    renderPicker();

    expect(screen.getByRole("button", { name: "White background" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Red background" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Green background" })).toBeInTheDocument();
  });

  it("keeps the hex input focusable when menu controls preserve editor selection", async () => {
    const user = userEvent.setup();
    renderPicker({
      onControlMouseDown: (event) => event.preventDefault(),
    });

    await user.click(screen.getByRole("button", { name: "Custom colour" }));
    const input = screen.getByLabelText("Hex");

    await user.click(input);

    expect(document.activeElement).toBe(input);
  });
});

function renderPicker(overrides: Partial<Parameters<typeof FullColorPicker>[0]> = {}) {
  return render(
    <FullColorPicker
      currentValue=""
      fallbackColor="#ffffff"
      label="Background colour"
      labelSuffix="background"
      palette={SCAFFOLD_TEXT_COLOR_OPTIONS}
      resetLabel="Reset to default"
      resetAriaLabel="Use default background colour"
      customHint="Enter a background hex colour, for example #ffffff."
      onChange={vi.fn()}
      onReset={vi.fn()}
      {...overrides}
    />,
  );
}
