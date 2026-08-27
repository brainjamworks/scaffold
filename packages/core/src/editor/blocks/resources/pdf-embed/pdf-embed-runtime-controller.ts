export type PdfPageNavigationOrigin = "learner" | "control-command" | "reconciliation";

export interface PdfPagePresentation {
  readonly previousPageNumber: number | null;
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly origin: PdfPageNavigationOrigin;
}

export type PdfPageNavigationOutcome =
  | { readonly kind: "success" }
  | { readonly kind: "cancelled" }
  | {
      readonly kind: "page-out-of-range";
      readonly requestedPage: number;
      readonly pageCount: number;
    }
  | { readonly kind: "pdf-unavailable"; readonly requestedPage: number };

interface PendingNavigation {
  readonly handleAbort: () => void;
  readonly origin: Exclude<PdfPageNavigationOrigin, "reconciliation">;
  readonly reject: (error: unknown) => void;
  readonly requestedPage: number;
  readonly resolve: (outcome: PdfPageNavigationOutcome) => void;
  readonly signal: AbortSignal;
}

type PresentationListener = (presentation: PdfPagePresentation) => void;
type AvailabilityListener = (ready: boolean) => void;

export interface PdfEmbedRuntimeController {
  readonly attachRequestPage: (requestPage: (pageNumber: number) => void) => () => void;
  readonly fail: () => void;
  readonly getPageCount: () => number | null;
  readonly getPresentedPageNumber: () => number | null;
  readonly isReady: () => boolean;
  readonly load: (pageCount: number) => void;
  readonly navigateTo: (
    pageNumber: number,
    origin: Exclude<PdfPageNavigationOrigin, "reconciliation">,
    signal: AbortSignal,
  ) => Promise<PdfPageNavigationOutcome>;
  readonly present: (pageNumber: number) => void;
  readonly reset: () => void;
  readonly subscribeToAvailability: (listener: AvailabilityListener) => () => void;
  readonly subscribeToPresentations: (listener: PresentationListener) => () => void;
}

const SUCCESS = Object.freeze({ kind: "success" as const });
const CANCELLED = Object.freeze({ kind: "cancelled" as const });

export function createPdfEmbedRuntimeController(): PdfEmbedRuntimeController {
  let requestPage: ((pageNumber: number) => void) | null = null;
  let pageCount: number | null = null;
  let presentedPageNumber: number | null = null;
  let pending: PendingNavigation | null = null;
  const presentationListeners = new Set<PresentationListener>();
  const availabilityListeners = new Set<AvailabilityListener>();

  const isReady = () => requestPage !== null && pageCount !== null && presentedPageNumber !== null;
  const publishAvailabilityChange = (wasReady: boolean) => {
    const ready = isReady();
    if (ready === wasReady) return;
    publishAll(availabilityListeners, ready);
  };
  const closePending = (outcome: PdfPageNavigationOutcome) => {
    const closing = pending;
    if (!closing) return;
    pending = null;
    closing.signal.removeEventListener("abort", closing.handleAbort);
    closing.resolve(outcome);
  };
  const failPending = (error: unknown) => {
    const failing = pending;
    if (!failing) throw error;
    pending = null;
    failing.signal.removeEventListener("abort", failing.handleAbort);
    failing.reject(error);
  };
  const becomeUnavailable = (readyBeforeChange = isReady()) => {
    const requestedPage = pending?.requestedPage;
    if (requestedPage !== undefined) {
      closePending(Object.freeze({ kind: "pdf-unavailable", requestedPage }));
    }
    pageCount = null;
    presentedPageNumber = null;
    publishAvailabilityChange(readyBeforeChange);
  };

  const controller: PdfEmbedRuntimeController = {
    attachRequestPage(nextRequestPage) {
      if (requestPage) throw new Error("PDF page request authority is already mounted.");
      const wasReady = isReady();
      requestPage = nextRequestPage;
      publishAvailabilityChange(wasReady);
      let attached = true;
      return () => {
        if (!attached) return;
        attached = false;
        if (requestPage !== nextRequestPage) return;
        const wasReady = isReady();
        requestPage = null;
        becomeUnavailable(wasReady);
      };
    },
    fail: becomeUnavailable,
    getPageCount: () => pageCount,
    getPresentedPageNumber: () => presentedPageNumber,
    isReady,
    load(nextPageCount) {
      if (!Number.isInteger(nextPageCount) || nextPageCount < 1) {
        throw new Error("PDF page count must be a positive integer.");
      }
      const wasReady = isReady();
      pageCount = nextPageCount;
      if (presentedPageNumber !== null && presentedPageNumber > nextPageCount) {
        presentedPageNumber = null;
      }
      publishAvailabilityChange(wasReady);
    },
    navigateTo(pageNumber, origin, signal) {
      if (signal.aborted) return Promise.resolve(CANCELLED);
      if (!Number.isInteger(pageNumber) || pageNumber < 1) {
        throw new Error("PDF requested page must be a positive integer.");
      }
      if (pageCount === null || requestPage === null) {
        return Promise.resolve(
          Object.freeze({ kind: "pdf-unavailable", requestedPage: pageNumber }),
        );
      }
      if (pageNumber > pageCount) {
        return Promise.resolve(
          Object.freeze({
            kind: "page-out-of-range",
            requestedPage: pageNumber,
            pageCount,
          }),
        );
      }
      if (presentedPageNumber === pageNumber) {
        const supersedesPendingRequest = pending !== null;
        closePending(CANCELLED);
        if (supersedesPendingRequest) requestPage(pageNumber);
        return Promise.resolve(SUCCESS);
      }

      closePending(CANCELLED);
      return new Promise<PdfPageNavigationOutcome>((resolve, reject) => {
        const handleAbort = () => {
          if (pending?.resolve !== resolve) return;
          closePending(CANCELLED);
        };
        pending = {
          handleAbort,
          origin,
          reject,
          requestedPage: pageNumber,
          resolve,
          signal,
        };
        signal.addEventListener("abort", handleAbort, { once: true });
        if (signal.aborted) {
          handleAbort();
          return;
        }
        try {
          requestPage?.(pageNumber);
        } catch (error) {
          failPending(error);
        }
      });
    },
    present(pageNumber) {
      if (pageCount === null) {
        throw new Error("PDF cannot present a page before its page count is loaded.");
      }
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
        throw new Error(
          `PDF presented page ${pageNumber} is outside the loaded page count ${pageCount}.`,
        );
      }
      const matching = pending?.requestedPage === pageNumber ? pending : null;
      const origin = matching?.origin ?? "reconciliation";
      const previousPageNumber = presentedPageNumber;
      const wasReady = isReady();
      presentedPageNumber = pageNumber;
      publishAvailabilityChange(wasReady);
      try {
        if (previousPageNumber !== pageNumber) {
          publishAll(
            presentationListeners,
            Object.freeze({ previousPageNumber, pageNumber, pageCount, origin }),
          );
        }
      } finally {
        if (matching && pending === matching) closePending(SUCCESS);
      }
    },
    reset: becomeUnavailable,
    subscribeToAvailability(listener) {
      availabilityListeners.add(listener);
      return () => {
        availabilityListeners.delete(listener);
      };
    },
    subscribeToPresentations(listener) {
      presentationListeners.add(listener);
      return () => {
        presentationListeners.delete(listener);
      };
    },
  };
  return Object.freeze(controller);
}

function publishAll<T>(listeners: Set<(value: T) => void>, value: T): void {
  let firstDefect: unknown;
  for (const listener of [...listeners]) {
    try {
      listener(value);
    } catch (error) {
      firstDefect ??= error;
    }
  }
  if (firstDefect !== undefined) throw firstDefect;
}
