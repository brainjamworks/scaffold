// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { RadioGroup, RadioItem } from "./Radio";

describe("Radio primitives", () => {
  it("reflects group and item visual contracts through semantic classes", () => {
    render(
      <RadioGroup aria-label="Layout" value="horizontal">
        <RadioItem value="vertical" />
        <RadioItem value="horizontal" />
      </RadioGroup>,
    );

    const group = screen.getByRole("radiogroup", { name: "Layout" });
    const items = screen.getAllByRole("radio");

    expect(group.classList.contains("sc-radio-group")).toBe(true);
    expect(items).toHaveLength(2);
    expect(items[1]?.classList.contains("sc-radio-item")).toBe(true);
    expect(items[1]?.getAttribute("data-state")).toBe("checked");
    expect(items[1]?.querySelector(".sc-radio-indicator")).not.toBeNull();
  });

  it("preserves consumer class names", () => {
    render(
      <RadioGroup aria-label="Mode" className="custom-group">
        <RadioItem value="one" className="custom-radio" />
      </RadioGroup>,
    );

    expect(
      screen.getByRole("radiogroup", { name: "Mode" }).classList.contains("custom-group"),
    ).toBe(true);
    expect(screen.getByRole("radio").classList.contains("custom-radio")).toBe(true);
  });

  it("renders custom item content without the default indicator when requested", () => {
    render(
      <RadioGroup aria-label="Resource kind" value="video">
        <RadioItem value="video" showIndicator={false}>
          <span data-testid="video-icon" />
        </RadioItem>
      </RadioGroup>,
    );

    const item = screen.getByRole("radio", { name: "" });

    expect(screen.getByTestId("video-icon").parentElement).toBe(item);
    expect(item.querySelector(".sc-radio-indicator")).toBeNull();
  });
});
