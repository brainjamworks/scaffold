import {
  ArrowSquareOutIcon as ArrowSquareOut,
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  FilePdfIcon as FilePdf,
  MinusIcon as Minus,
  PlusIcon as Plus,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import type { PdfEmbedData } from "@scaffold/contracts";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import {
  mediaLoadingMessage,
  mediaMissingMessage,
  mediaUnavailableMessage,
} from "@/editor/media/accessibility/media-accessibility";
import { BOUNDED_PLACEMENT_ATTR } from "@/editor/frame/model/bounded-placement";

import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";

import "./PdfEmbed.css";

interface MediaPortLite {
  resolve: (mediaId: string) => Promise<string>;
}

interface PdfPageDimensions {
  originalHeight: number;
  originalWidth: number;
  pageNumber: number;
}

interface ViewerProps {
  url: string;
  pageNumber: number;
  scale?: number;
  width?: number;
  onLoadSuccess: (numPages: number) => void;
  onLoadError: (message: string) => void;
  onPageLoadSuccess: (dimensions: PdfPageDimensions) => void;
}

const PDF_ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;

type PdfZoomScale = (typeof PDF_ZOOM_STEPS)[number];
type PdfZoom = "fit" | PdfZoomScale;

const PdfViewer = lazy<ComponentType<ViewerProps>>(async () => {
  const [reactPdf] = await Promise.all([
    import("react-pdf"),
    import("react-pdf/dist/Page/AnnotationLayer.css"),
    import("react-pdf/dist/Page/TextLayer.css"),
  ]);
  const { Document, Page, pdfjs } = reactPdf;

  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  function Renderer({
    url,
    pageNumber,
    scale,
    width,
    onLoadSuccess,
    onLoadError,
    onPageLoadSuccess,
  }: ViewerProps) {
    return (
      <Document
        className="sc-pdf-embed__document"
        file={url}
        loading={<PdfStateMessage>{mediaLoadingMessage("pdf")}</PdfStateMessage>}
        error={
          <PdfErrorMessage>
            We couldn't load this PDF. Check the source or your network.
          </PdfErrorMessage>
        }
        noData={<PdfErrorMessage>{mediaMissingMessage("pdf")}</PdfErrorMessage>}
        onLoadSuccess={({ numPages }) => onLoadSuccess(numPages)}
        onLoadError={(error) => onLoadError(error.message)}
      >
        <Page
          pageNumber={pageNumber}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          {...(scale === undefined ? {} : { scale })}
          {...(width === undefined ? {} : { width })}
          onLoadSuccess={({ originalHeight, originalWidth, pageNumber: loadedPageNumber }) =>
            onPageLoadSuccess({
              originalHeight,
              originalWidth,
              pageNumber: loadedPageNumber,
            })
          }
        />
      </Document>
    );
  }

  return { default: Renderer };
});

export function PdfEmbedSurface({
  data,
  editable,
  mediaPort,
  onAdd,
  onOpen,
  onPagePresented,
  presented = true,
}: {
  data: PdfEmbedData;
  editable: boolean;
  mediaPort: MediaPortLite | null;
  onAdd?: () => void;
  onOpen?: () => void;
  onPagePresented?: (page: { pageNumber: number; pageCount: number }) => void;
  presented?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const generatedId = useId();
  const [stageSize, setStageSize] = useState<{
    boundedHeight: number | null;
    width: number;
  }>({ boundedHeight: null, width: 0 });
  const [pageDimensions, setPageDimensions] = useState<PdfPageDimensions | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(data.initialPage);
  const [zoom, setZoom] = useState<PdfZoom>("fit");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{
    mediaId: string;
    url: string;
  } | null>(null);
  const [resolveError, setResolveError] = useState<{
    mediaId: string;
    message: string;
  } | null>(null);

  const source = data.source;
  const pdfTitle = data.title.trim();
  const pdfLabel = pdfTitle || "PDF";
  const captionId = `${generatedId}-caption`;
  const pagerId = `${generatedId}-pager`;
  const zoomStatusId = `${generatedId}-zoom-status`;
  const managedMediaId = source?.mode === "managed" ? source.mediaId : null;
  const externalSrc = source?.mode === "external" ? source.src : null;

  useEffect(() => {
    if (!managedMediaId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolved(null);
      setResolveError(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (!mediaPort) {
          throw new Error("No media port configured.");
        }
        const url = await mediaPort.resolve(managedMediaId);
        if (!cancelled) {
          setResolved({ mediaId: managedMediaId, url });
          setResolveError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setResolveError({
            mediaId: managedMediaId,
            message: e instanceof Error ? e.message : mediaUnavailableMessage("pdf"),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [managedMediaId, mediaPort]);

  const fileUrl = useMemo(() => {
    if (externalSrc) return externalSrc;
    if (managedMediaId && resolved?.mediaId === managedMediaId) return resolved.url;
    return null;
  }, [externalSrc, managedMediaId, resolved]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const frame = stage.closest(".sc-pdf-embed");
      const next = {
        boundedHeight:
          frame?.getAttribute(BOUNDED_PLACEMENT_ATTR) === "fill" ? stage.clientHeight : null,
        width: stage.clientWidth,
      };
      setStageSize((current) =>
        current.width === next.width && current.boundedHeight === next.boundedHeight
          ? current
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageNumber(Math.max(1, data.initialPage));
    setPageDimensions(null);
    setZoom("fit");
    setErrorMessage(null);
    setNumPages(null);
  }, [fileUrl, data.initialPage]);

  useEffect(() => {
    if (numPages !== null && pageNumber > numPages) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageNumber(numPages);
    }
  }, [numPages, pageNumber]);

  useEffect(() => {
    if (
      !presented ||
      !onPagePresented ||
      numPages === null ||
      pageDimensions?.pageNumber !== pageNumber
    ) {
      return;
    }
    onPagePresented({ pageNumber, pageCount: numPages });
  }, [numPages, onPagePresented, pageDimensions?.pageNumber, pageNumber, presented]);

  const goToPage = useCallback(
    (next: number) => {
      if (numPages === null) return;
      const clamped = Math.max(1, Math.min(next, numPages));
      setPageNumber(clamped);
    },
    [numPages],
  );

  const showStats = useMemo(() => numPages !== null && !errorMessage, [numPages, errorMessage]);
  const pageStatusLabel = showStats
    ? `Page ${pageNumber} of ${numPages}`
    : "Page count unavailable";

  const loadFailure =
    resolveError && managedMediaId && resolveError.mediaId === managedMediaId
      ? resolveError.message
      : errorMessage;
  const activePageDimensions = pageDimensions?.pageNumber === pageNumber ? pageDimensions : null;
  const fittedPageWidth = resolvePdfPageWidth({
    availableHeight: stageSize.boundedHeight,
    availableWidth: stageSize.width,
    pageDimensions: activePageDimensions,
  });
  const fitScale = resolvePdfFitScale(fittedPageWidth, activePageDimensions);
  const zoomOutScale = resolveNextPdfZoomScale(zoom === "fit" ? fitScale : zoom, -1);
  const zoomInScale = resolveNextPdfZoomScale(zoom === "fit" ? fitScale : zoom, 1);
  const zoomLabel = zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`;

  if (!source) {
    return <PdfEmptyState disabled={!editable || !onAdd} {...(onAdd ? { onAdd } : {})} />;
  }

  return (
    <figure
      className="sc-pdf-embed__figure"
      aria-labelledby={pdfTitle ? captionId : undefined}
      aria-label={pdfTitle ? undefined : "PDF embed"}
    >
      {pdfTitle ? (
        <figcaption id={captionId} className="sc-pdf-embed__caption">
          {pdfTitle}
        </figcaption>
      ) : null}
      <div
        ref={stageRef}
        className="sc-pdf-embed__stage"
        role="group"
        aria-label={`${pdfLabel} preview`}
        aria-describedby={showStats ? pagerId : undefined}
        data-pdf-zoomed={zoom === "fit" ? undefined : ""}
        tabIndex={zoom === "fit" ? undefined : 0}
      >
        {fileUrl && fittedPageWidth > 0 ? (
          <Suspense fallback={<PdfStateMessage>{mediaLoadingMessage("pdf")}</PdfStateMessage>}>
            <PdfViewer
              url={fileUrl}
              pageNumber={pageNumber}
              {...(zoom === "fit" ? { width: fittedPageWidth } : { scale: zoom })}
              onLoadSuccess={(pages) => {
                setNumPages(pages);
                setErrorMessage(null);
              }}
              onLoadError={(message) => {
                setErrorMessage(message);
                setNumPages(null);
              }}
              onPageLoadSuccess={(dimensions) => {
                setPageDimensions((current) =>
                  current?.pageNumber === dimensions.pageNumber &&
                  current.originalWidth === dimensions.originalWidth &&
                  current.originalHeight === dimensions.originalHeight
                    ? current
                    : dimensions,
                );
              }}
            />
          </Suspense>
        ) : loadFailure ? (
          <PdfErrorMessage>{loadFailure}</PdfErrorMessage>
        ) : (
          <PdfStateMessage>{mediaLoadingMessage("pdf")}</PdfStateMessage>
        )}
      </div>
      <div className="sc-pdf-embed__chrome" contentEditable={false}>
        <div className="sc-pdf-embed__nav">
          <button
            type="button"
            onClick={() => goToPage(pageNumber - 1)}
            disabled={pageNumber <= 1 || numPages === null}
            className="sc-pdf-embed__nav-button"
            aria-label="Previous page"
          >
            <CaretLeft size={14} weight="bold" aria-hidden />
          </button>
          <div
            id={pagerId}
            className="sc-pdf-embed__pager"
            role="status"
            aria-live="polite"
            aria-label={pageStatusLabel}
          >
            {showStats ? (
              <>
                <span className="sc-pdf-embed__page-current">{pageNumber}</span>
                <span className="sc-pdf-embed__page-divider">/</span>
                <span className="sc-pdf-embed__page-total">{numPages}</span>
              </>
            ) : (
              <span className="sc-pdf-embed__page-stat">-</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => goToPage(pageNumber + 1)}
            disabled={numPages === null || pageNumber >= numPages}
            className="sc-pdf-embed__nav-button"
            aria-label="Next page"
          >
            <CaretRight size={14} weight="bold" aria-hidden />
          </button>
        </div>
        <div
          className="sc-pdf-embed__zoom"
          role="group"
          aria-label="PDF zoom controls"
          aria-describedby={zoomStatusId}
        >
          <button
            type="button"
            onClick={() => {
              if (zoomOutScale !== null) setZoom(zoomOutScale);
            }}
            disabled={!showStats || zoomOutScale === null}
            className="sc-pdf-embed__zoom-button"
            aria-label="Zoom out"
          >
            <Minus size={13} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setZoom("fit")}
            disabled={!showStats || zoom === "fit"}
            className="sc-pdf-embed__zoom-value"
            aria-label={zoom === "fit" ? "PDF zoom set to fit" : `Zoom ${zoomLabel}. Reset to fit`}
          >
            {zoomLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              if (zoomInScale !== null) setZoom(zoomInScale);
            }}
            disabled={!showStats || zoomInScale === null}
            className="sc-pdf-embed__zoom-button"
            aria-label="Zoom in"
          >
            <Plus size={13} weight="bold" aria-hidden />
          </button>
        </div>
        <span
          id={zoomStatusId}
          className="sc-sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`PDF zoom ${zoomLabel}`}
        >
          PDF zoom {zoomLabel}
        </span>
        <div className="sc-pdf-embed__chrome-end">
          {editable && onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              aria-label={`Replace ${pdfLabel}`}
              className="sc-pdf-embed__replace"
            >
              Replace
            </button>
          ) : null}
          {fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onOpen}
              className="sc-pdf-embed__open"
              aria-label={`Open ${pdfLabel} in new tab`}
            >
              <ArrowSquareOut size={12} weight="bold" aria-hidden />
              <span>Open</span>
            </a>
          ) : null}
        </div>
      </div>
    </figure>
  );
}

function resolvePdfPageWidth({
  availableHeight,
  availableWidth,
  pageDimensions,
}: {
  availableHeight: number | null;
  availableWidth: number;
  pageDimensions: PdfPageDimensions | null;
}): number {
  if (
    availableHeight === null ||
    availableHeight <= 0 ||
    !pageDimensions ||
    pageDimensions.originalHeight <= 0 ||
    pageDimensions.originalWidth <= 0
  ) {
    return availableWidth;
  }

  return Math.min(
    availableWidth,
    (availableHeight * pageDimensions.originalWidth) / pageDimensions.originalHeight,
  );
}

function resolvePdfFitScale(
  fittedPageWidth: number,
  pageDimensions: PdfPageDimensions | null,
): number {
  if (!pageDimensions || pageDimensions.originalWidth <= 0) return 1;
  return fittedPageWidth / pageDimensions.originalWidth;
}

function resolveNextPdfZoomScale(currentScale: number, direction: -1 | 1): PdfZoomScale | null {
  if (direction === 1) {
    return PDF_ZOOM_STEPS.find((step) => step > currentScale + Number.EPSILON) ?? null;
  }

  for (let index = PDF_ZOOM_STEPS.length - 1; index >= 0; index -= 1) {
    const step = PDF_ZOOM_STEPS[index];
    if (step !== undefined && step < currentScale - Number.EPSILON) return step;
  }

  return null;
}

function PdfEmptyState({ disabled, onAdd }: { disabled: boolean; onAdd?: () => void }) {
  return (
    <div className="sc-pdf-embed__empty">
      <span className="sc-pdf-embed__empty-chip" aria-hidden>
        <FilePdf size={20} weight="regular" />
      </span>
      <div className="sc-pdf-embed__empty-text">
        <p className="sc-pdf-embed__empty-title">PDF</p>
        <p className="sc-pdf-embed__empty-hint">
          Upload a PDF, pick from your library, or paste a URL.
        </p>
      </div>
      {disabled ? null : (
        <button
          type="button"
          className="sc-pdf-embed__empty-submit"
          onClick={onAdd}
          onMouseDown={(event) => event.stopPropagation()}
        >
          Add PDF
        </button>
      )}
    </div>
  );
}

function PdfStateMessage({ children }: { children: ReactNode }) {
  return (
    <div className={cn("sc-pdf-embed__state")} role="status">
      {children}
    </div>
  );
}

function PdfErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div className="sc-pdf-embed__state sc-pdf-embed__state--error" role="alert">
      <WarningCircle size={14} weight="fill" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
