// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { emptyPdfEmbedData } from "./content";
import { PdfEmbedSurface } from "./PdfEmbedSurface";

const pdfPageRenders = vi.hoisted(
  () =>
    [] as Array<{
      pageNumber: number;
      scale: number | undefined;
      width: number | undefined;
    }>,
);

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
  Page({
    onLoadSuccess,
    pageNumber,
    scale,
    width,
  }: {
    onLoadSuccess?: (result: {
      originalHeight: number;
      originalWidth: number;
      pageNumber: number;
    }) => void;
    pageNumber: number;
    scale?: number;
    width?: number;
  }) {
    pdfPageRenders.push({ pageNumber, scale, width });

    useEffect(() => {
      onLoadSuccess?.({
        pageNumber,
        ...(pageNumber === 1
          ? { originalHeight: 800, originalWidth: 600 }
          : { originalHeight: 600, originalWidth: 800 }),
      });
    }, [onLoadSuccess, pageNumber]);

    return (
      <div
        data-testid="pdf-page"
        data-render-scale={scale ?? "fit"}
        data-render-width={width ?? ""}
      >
        PDF page {pageNumber}
      </div>
    );
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
let clientHeightSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  pdfPageRenders.length = 0;
  clientWidthSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  clientHeightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(360);
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterEach(() => {
  clientWidthSpy.mockRestore();
  clientHeightSpy.mockRestore();
  vi.unstubAllGlobals();
  cleanup();
});

it("announces the current PDF page and disables page navigation at bounds", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  const onPagePresented = vi.fn();
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
      onOpen={onOpen}
      onPagePresented={onPagePresented}
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
  const openLink = screen.getByRole("link", { name: "Open Course handbook in new tab" });
  expect(openLink).toBeInTheDocument();
  await user.click(openLink);
  expect(onOpen).toHaveBeenCalledOnce();

  await screen.findByText("PDF page 1");

  await waitFor(() => {
    expect(onPagePresented).toHaveBeenCalledWith({ pageNumber: 1, pageCount: 3 });
    expect(screen.getByRole("status", { name: "Page 1 of 3" })).toBeInTheDocument();
    expect(preview.getAttribute("aria-describedby")).toBe(
      screen.getByRole("status", { name: "Page 1 of 3" }).id,
    );
    expect(previous).toHaveProperty("disabled", true);
    expect(next).toHaveProperty("disabled", false);
  });

  await user.click(next);

  await waitFor(() => {
    expect(onPagePresented).toHaveBeenCalledWith({ pageNumber: 2, pageCount: 3 });
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

it("waits until an already-rendered PDF page is presented", async () => {
  const onPagePresented = vi.fn();
  const data = emptyPdfEmbedData({
    source: {
      mode: "external",
      src: "https://example.com/sample.pdf",
    },
  });
  const { rerender } = render(
    <PdfEmbedSurface
      data={data}
      editable={false}
      mediaPort={null}
      presented={false}
      onPagePresented={onPagePresented}
    />,
  );

  await screen.findByText("PDF page 1");
  expect(onPagePresented).not.toHaveBeenCalled();

  rerender(
    <PdfEmbedSurface
      data={data}
      editable={false}
      mediaPort={null}
      presented
      onPagePresented={onPagePresented}
    />,
  );

  await waitFor(() => {
    expect(onPagePresented).toHaveBeenCalledWith({ pageNumber: 1, pageCount: 3 });
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

it("fits portrait and landscape pages within a bounded stage", async () => {
  const source = {
    mode: "external" as const,
    src: "https://example.com/sample.pdf",
  };
  const { rerender } = render(
    <div className="sc-pdf-embed" data-bounded-placement="fill">
      <PdfEmbedSurface
        data={emptyPdfEmbedData({ source, initialPage: 1 })}
        editable={false}
        mediaPort={null}
      />
    </div>,
  );

  await waitFor(() => {
    expect(screen.getByTestId("pdf-page").dataset["renderWidth"]).toBe("270");
  });

  rerender(
    <div className="sc-pdf-embed" data-bounded-placement="fill">
      <PdfEmbedSurface
        data={emptyPdfEmbedData({ source, initialPage: 2 })}
        editable={false}
        mediaPort={null}
      />
    </div>,
  );

  await waitFor(() => {
    expect(screen.getByTestId("pdf-page").dataset["renderWidth"]).toBe("480");
  });
});

it("ignores bounded placement inherited from a different ancestor frame", async () => {
  render(
    <div data-bounded-placement="fill">
      <div className="sc-pdf-embed">
        <PdfEmbedSurface
          data={emptyPdfEmbedData({
            source: {
              mode: "external",
              src: "https://example.com/sample.pdf",
            },
          })}
          editable={false}
          mediaPort={null}
        />
      </div>
    </div>,
  );

  await waitFor(() => {
    expect(screen.getByTestId("pdf-page").dataset["renderWidth"]).toBe("640");
  });
});

it("keeps ordinary page-flow rendering width-driven", async () => {
  render(
    <PdfEmbedSurface
      data={emptyPdfEmbedData({
        source: {
          mode: "external",
          src: "https://example.com/sample.pdf",
        },
      })}
      editable={false}
      mediaPort={null}
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId("pdf-page").dataset["renderWidth"]).toBe("640");
  });
});

it("starts in fit mode and advances to the next fixed zoom step", async () => {
  const user = userEvent.setup();
  render(
    <PdfEmbedSurface
      data={emptyPdfEmbedData({
        source: {
          mode: "external",
          src: "https://example.com/sample.pdf",
        },
      })}
      editable={false}
      mediaPort={null}
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId("pdf-page").dataset["renderWidth"]).toBe("640");
  });

  expect(screen.getByRole("button", { name: "PDF zoom set to fit" })).toHaveTextContent("Fit");

  await user.click(screen.getByRole("button", { name: "Zoom in" }));

  await waitFor(() => {
    expect(screen.getByTestId("pdf-page").dataset["renderWidth"]).toBe("");
    expect(screen.getByTestId("pdf-page").dataset["renderScale"]).toBe("1.25");
  });
  expect(screen.getByRole("button", { name: "Zoom 125%. Reset to fit" })).toHaveTextContent("125%");
  expect(screen.getByRole("status", { name: "PDF zoom 125%" })).toHaveTextContent("PDF zoom 125%");
});

it("does not fit a new page using dimensions retained from the previous page", async () => {
  const user = userEvent.setup();
  render(
    <div className="sc-pdf-embed" data-bounded-placement="fill">
      <PdfEmbedSurface
        data={emptyPdfEmbedData({
          source: {
            mode: "external",
            src: "https://example.com/sample.pdf",
          },
        })}
        editable={false}
        mediaPort={null}
      />
    </div>,
  );

  await waitFor(() => {
    expect(screen.getByTestId("pdf-page").dataset["renderWidth"]).toBe("270");
  });
  pdfPageRenders.length = 0;

  await user.click(screen.getByRole("button", { name: "Next page" }));

  await waitFor(() => {
    expect(screen.getByTestId("pdf-page").dataset["renderWidth"]).toBe("480");
  });
  const secondPageWidths = pdfPageRenders
    .filter(({ pageNumber }) => pageNumber === 2)
    .map(({ width }) => width);
  expect(secondPageWidths[0]).toBe(640);
  expect(secondPageWidths).not.toContain(270);
  expect(secondPageWidths).toContain(480);
});

it("keeps stepped zoom between 50% and 300%", async () => {
  const user = userEvent.setup();
  render(
    <PdfEmbedSurface
      data={emptyPdfEmbedData({
        source: {
          mode: "external",
          src: "https://example.com/sample.pdf",
        },
      })}
      editable={false}
      mediaPort={null}
    />,
  );

  await screen.findByText("PDF page 1");
  const zoomOut = screen.getByRole("button", { name: "Zoom out" });
  const zoomIn = screen.getByRole("button", { name: "Zoom in" });

  for (let index = 0; index < 8; index += 1) {
    await user.click(zoomIn);
  }

  expect(screen.getByRole("button", { name: "Zoom 300%. Reset to fit" })).toBeInTheDocument();
  expect(zoomIn).toHaveProperty("disabled", true);

  for (let index = 0; index < 8; index += 1) {
    await user.click(zoomOut);
  }

  expect(screen.getByRole("button", { name: "Zoom 50%. Reset to fit" })).toBeInTheDocument();
  expect(zoomOut).toHaveProperty("disabled", true);
});

it("resets percentage zoom to responsive fit", async () => {
  const user = userEvent.setup();
  render(
    <PdfEmbedSurface
      data={emptyPdfEmbedData({
        source: {
          mode: "external",
          src: "https://example.com/sample.pdf",
        },
      })}
      editable={false}
      mediaPort={null}
    />,
  );

  await screen.findByText("PDF page 1");
  await user.click(screen.getByRole("button", { name: "Zoom in" }));
  await user.click(screen.getByRole("button", { name: "Zoom 125%. Reset to fit" }));

  await waitFor(() => {
    expect(screen.getByTestId("pdf-page").dataset["renderWidth"]).toBe("640");
    expect(screen.getByTestId("pdf-page").dataset["renderScale"]).toBe("fit");
  });
  expect(screen.getByRole("button", { name: "PDF zoom set to fit" })).toHaveTextContent("Fit");
});
