// @vitest-environment happy-dom

import { render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vite-plus/test";

import { PopoverSurface } from "./PopoverSurface";

describe("PopoverSurface", () => {
  it("renders neutral fixed chrome around a body-only scroll boundary", () => {
    const bodyRef = createRef<HTMLDivElement>();

    render(
      <PopoverSurface
        bodyRef={bodyRef}
        description="A short nudge learners can reveal."
        descriptionId="hint-description"
        footerEnd={<button type="button">Done</button>}
        footerStart={<button type="button">Delete hint</button>}
        headerActions={<button type="button">Next hint</button>}
        icon={<span>?</span>}
        meta="1 of 2"
        title="Hint 1"
        titleId="hint-title"
        tone="hint"
      >
        <p>Use elimination.</p>
      </PopoverSurface>,
    );

    const surface = screen.getByText("Hint 1").closest("[data-scaffold-popover-surface]");
    expect(surface).toBeInstanceOf(HTMLElement);
    if (!(surface instanceof HTMLElement)) throw new Error("Expected popover surface");

    const header = surface.querySelector('[data-slot="popover-surface-header"]');
    const body = surface.querySelector('[data-slot="popover-surface-body"]');
    const footer = surface.querySelector('[data-slot="popover-surface-footer"]');

    expect(header).toBeInstanceOf(HTMLElement);
    expect(body).toBeInstanceOf(HTMLElement);
    expect(footer).toBeInstanceOf(HTMLElement);
    if (!(header instanceof HTMLElement)) throw new Error("Expected popover surface header");
    if (!(body instanceof HTMLElement)) throw new Error("Expected popover surface body");
    if (!(footer instanceof HTMLElement)) throw new Error("Expected popover surface footer");

    expect(surface.getAttribute("data-tone")).toBe("hint");
    expect(surface.children[0]).toBe(header);
    expect(surface.children[1]).toBe(body);
    expect(surface.children[2]).toBe(footer);
    expect(within(header).getByText("Hint 1").id).toBe("hint-title");
    expect(within(header).getByText("A short nudge learners can reveal.").id).toBe(
      "hint-description",
    );
    expect(header.querySelector(".sc-popover-surface__icon")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(within(header).getByText("1 of 2")).toBeInstanceOf(HTMLElement);
    expect(within(header).getByRole("button", { name: "Next hint" })).toBeInstanceOf(
      HTMLButtonElement,
    );
    expect(bodyRef.current).toBe(body);
    expect(within(body).getByText("Use elimination.")).toBeInstanceOf(HTMLElement);
    expect(within(footer).getByRole("button", { name: "Delete hint" })).toBeInstanceOf(
      HTMLButtonElement,
    );
    expect(within(footer).getByRole("button", { name: "Done" })).toBeInstanceOf(HTMLButtonElement);
  });
});
