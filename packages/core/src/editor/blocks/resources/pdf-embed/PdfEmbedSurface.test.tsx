// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { emptyPdfEmbedData } from "./content";
import { PdfEmbedSurface } from "./PdfEmbedSurface";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document({
    children,
    onLoadSuccess,
  }: {
    children: ReactNode;
    onLoadSuccess?: (result: { numPages: number }) => void;
  }) {
    useEffect(() => {
      onLoadSuccess?.({ numPages: 3 });
    }, [onLoadSuccess]);

    return <div>{children}</div>;
  },
  Page({ pageNumber }: { pageNumber: number }) {
    return <div>PDF page {pageNumber}</div>;
  },
}));

class MockResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: target.getBoundingClientRect(),
        } as ResizeObserverEntry,
      ],
      this,
    );
  }

  unobserve() {}

  disconnect() {}
}

let clientWidthSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clientWidthSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterEach(() => {
  clientWidthSpy.mockRestore();
  vi.unstubAllGlobals();
  cleanup();
});

it("announces the current PDF page and disables page navigation at bounds", async () => {
  const user = userEvent.setup();
  render(
    <PdfEmbedSurface
      data={emptyPdfEmbedData({
        source: {
          mode: "external",
          src: "https://example.com/sample.pdf",
        },
        title: "Course handbook",
      })}
      editable
      mediaPort={null}
      onAdd={() => {}}
    />,
  );

  const previous = screen.getByRole("button", { name: "Previous page" });
  const next = screen.getByRole("button", { name: "Next page" });
  const preview = screen.getByRole("group", {
    name: "Course handbook preview",
  });

  expect(screen.getByRole("figure", { name: "Course handbook" })).toBeInTheDocument();
  expect(preview.getAttribute("aria-describedby")).toBeNull();
  expect(screen.getByRole("button", { name: "Replace Course handbook" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open Course handbook in new tab" })).toBeInTheDocument();

  await screen.findByText("PDF page 1");

  await waitFor(() => {
    expect(screen.getByRole("status", { name: "Page 1 of 3" })).toBeInTheDocument();
    expect(preview.getAttribute("aria-describedby")).toBe(
      screen.getByRole("status", { name: "Page 1 of 3" }).id,
    );
    expect(previous).toHaveProperty("disabled", true);
    expect(next).toHaveProperty("disabled", false);
  });

  await user.click(next);

  await waitFor(() => {
    expect(screen.getByRole("status", { name: "Page 2 of 3" })).toBeInTheDocument();
    expect(previous).toHaveProperty("disabled", false);
    expect(next).toHaveProperty("disabled", false);
  });

  await user.click(next);

  await waitFor(() => {
    expect(screen.getByRole("status", { name: "Page 3 of 3" })).toBeInTheDocument();
    expect(previous).toHaveProperty("disabled", false);
    expect(next).toHaveProperty("disabled", true);
  });
});

it("keeps PDF loading, empty, and error states semantic", async () => {
  render(<PdfEmbedSurface data={emptyPdfEmbedData()} editable mediaPort={null} onAdd={() => {}} />);

  expect(screen.getByRole("button", { name: "Add PDF" })).toBeInTheDocument();

  cleanup();

  render(
    <PdfEmbedSurface
      data={emptyPdfEmbedData({
        source: {
          mode: "managed",
          mediaId: "missing-pdf",
        },
      })}
      editable
      mediaPort={{
        resolve: async () => {
          throw new Error("PDF unavailable");
        },
      }}
      onAdd={() => {}}
    />,
  );

  expect((await screen.findByRole("alert")).textContent).toContain("PDF unavailable");
  expect(screen.getByRole("group", { name: "PDF preview" }).textContent).toContain(
    "PDF unavailable",
  );
});
