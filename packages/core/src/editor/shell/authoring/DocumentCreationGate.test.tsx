// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { DocumentCreationGate } from "./DocumentCreationGate";

describe("DocumentCreationGate", () => {
  it("presents document formats as an App entry page rather than a modal", () => {
    render(<DocumentCreationGate onCreate={vi.fn()} state="idle" />);

    expect(screen.getByRole("main", { name: "Choose a format" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Slideshow")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("creates a Slideshow immediately without collecting a Course Section title", async () => {
    const onCreate = vi.fn();
    render(<DocumentCreationGate onCreate={onCreate} state="idle" />);

    await userEvent.click(screen.getByRole("button", { name: "Create slideshow (beta)" }));
    expect(screen.queryByLabelText("Initial Course Section title")).toBeNull();
    expect(onCreate).toHaveBeenCalledWith({ mode: "slideshow" });
  });

  it("creates a Page without collecting a Course Section title", async () => {
    const onCreate = vi.fn();
    render(<DocumentCreationGate onCreate={onCreate} state="idle" />);
    await userEvent.click(screen.getByRole("button", { name: "Create page" }));
    expect(onCreate).toHaveBeenCalledWith({ mode: "page" });
  });
});
