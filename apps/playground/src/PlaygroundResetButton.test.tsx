// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { PlaygroundResetButton } from "./PlaygroundResetButton";

afterEach(cleanup);

describe("PlaygroundResetButton", () => {
  it("uses the accessible authoring header icon action", async () => {
    const user = userEvent.setup();
    render(<PlaygroundResetButton />);

    const reset = screen.getByRole("button", { name: "Reset playground" });
    expect(reset).toHaveClass("sc-icon-button");
    expect(reset).toHaveTextContent("");

    await user.hover(reset);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Reset playground");
  });
});
