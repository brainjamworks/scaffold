// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { AttemptCounter } from "./AttemptCounter";

describe("AttemptCounter", () => {
  it("renders normal attempts as status text instead of a filled pill", () => {
    render(<AttemptCounter attempts={1} maxAttempts={3} />);

    const status = screen.getByRole("status", {
      name: "1 of 3 attempts used.",
    });

    expect(status.textContent).toBe("1 of 3");
    expect(status.getAttribute("data-state")).toBe("normal");
    expect(status.classList.contains("sc-pill")).toBe(false);
  });

  it("keeps final attempts visibly distinct", () => {
    render(<AttemptCounter attempts={3} maxAttempts={3} />);

    const status = screen.getByRole("status", {
      name: "Final attempt used.",
    });

    expect(status.textContent).toBe("Final attempt");
    expect(status.getAttribute("data-state")).toBe("final");
  });
});
