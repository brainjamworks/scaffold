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

  it("commits a custom hex colour when its shared input loses focus", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({
      currentValue: "#161d77",
      onChange,
    });

    await user.click(screen.getByRole("button", { name: "Custom colour" }));
    const input = screen.getByLabelText("Hex");
    await user.clear(input);
    await user.type(input, "#123456");
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith("#123456");
  });

  it("disables every picker action when colour editing is disabled", () => {
    renderPicker({ disabled: true });

    expect(screen.getAllByRole("button").every((button) => button.hasAttribute("disabled"))).toBe(
      true,
    );
  });

  it("marks a non-empty reset value as active", () => {
    renderPicker({ currentValue: "#ffffff", resetValue: "#ffffff" });

    expect(screen.getByRole("button", { name: "Use default background colour" })).toHaveClass(
      "is-active",
    );
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
