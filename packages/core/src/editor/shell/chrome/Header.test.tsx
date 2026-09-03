// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { Header } from "./Header";

function EditableHeader({ initialTitle }: { initialTitle: string }) {
  const [title, setTitle] = useState(initialTitle);
  return <Header title={title} onTitleChange={setTitle} />;
}

describe("Header", () => {
  it("identifies the document title field for browser form heuristics", () => {
    render(<Header title="Course title" onTitleChange={vi.fn()} />);

    const title = screen.getByLabelText("Document title");

    expect(title.getAttribute("id")).toBe("scaffold-document-title");
    expect(title.getAttribute("name")).toBe("scaffold-document-title");
  });

  it("renders the brand lockup for the requested application surface", () => {
    render(<Header title="Course title" onTitleChange={vi.fn()} brandSurface="dark" />);

    const mark = screen.getByRole("img", { name: "scaffold mark" });
    const markStroke = mark.querySelector("path")?.getAttribute("stroke");
    const wordmark = mark.closest("[data-scaffold-wordmark]")?.querySelector(":scope > span");

    expect(markStroke).toBe("#FFFFFF");
    expect(wordmark).toHaveStyle({ color: "#FFFFFF" });
  });

  it("allows a temporary blank title and materializes Untitled on blur", async () => {
    const user = userEvent.setup();
    render(<EditableHeader initialTitle="Course title" />);
    const title = screen.getByLabelText("Document title");

    await user.clear(title);
    expect(title).toHaveValue("");

    await user.type(title, "   ");
    expect(title).toHaveValue("   ");

    await user.tab();
    expect(title).toHaveValue("Untitled");
  });

  it("trims a non-empty title on blur", async () => {
    const user = userEvent.setup();
    render(<EditableHeader initialTitle="  Course title  " />);
    const title = screen.getByLabelText("Document title");

    await user.click(title);
    await user.tab();

    expect(title).toHaveValue("Course title");
  });

  it("does not report a change when a blurred title is already canonical", async () => {
    const user = userEvent.setup();
    const onTitleChange = vi.fn();
    render(<Header title="Course title" onTitleChange={onTitleChange} />);
    const title = screen.getByLabelText("Document title");

    await user.click(title);
    await user.tab();

    expect(onTitleChange).not.toHaveBeenCalled();
  });
});
