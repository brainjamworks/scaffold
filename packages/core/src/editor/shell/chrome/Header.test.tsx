// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { Header } from "./Header";

describe("Header", () => {
  it("identifies the document title field for browser form heuristics", () => {
    render(<Header title="Course title" onTitleChange={vi.fn()} />);

    const title = screen.getByLabelText("Document title");

    expect(title.getAttribute("id")).toBe("scaffold-document-title");
    expect(title.getAttribute("name")).toBe("scaffold-document-title");
  });
});
