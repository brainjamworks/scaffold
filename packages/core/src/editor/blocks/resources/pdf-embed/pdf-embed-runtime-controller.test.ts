import { describe, expect, it, vi } from "vite-plus/test";

import { createPdfEmbedRuntimeController } from "./pdf-embed-runtime-controller";

describe("PDF Embed runtime controller", () => {
  it("commits the initial and learner-requested page only after successful presentation", async () => {
    const controller = createPdfEmbedRuntimeController();
    const requestPage = vi.fn();
    controller.attachRequestPage(requestPage);
    const presentations: unknown[] = [];
    controller.subscribeToPresentations((presentation) => {
      presentations.push({
        presentation,
        current: controller.getPresentedPageNumber(),
      });
    });

    controller.load(4);
    expect(controller.isReady()).toBe(false);
    controller.present(1);
    expect(controller.isReady()).toBe(true);
    expect(presentations).toEqual([
      {
        presentation: {
          previousPageNumber: null,
          pageNumber: 1,
          pageCount: 4,
          origin: "reconciliation",
        },
        current: 1,
      },
    ]);

    const navigation = controller.navigateTo(2, "learner", new AbortController().signal);
    expect(requestPage).toHaveBeenCalledWith(2);
    expect(controller.getPresentedPageNumber()).toBe(1);
    let settled = false;
    void navigation.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    controller.present(2);
    await expect(navigation).resolves.toEqual({ kind: "success" });
    expect(presentations.at(-1)).toEqual({
      presentation: {
        previousPageNumber: 1,
        pageNumber: 2,
        pageCount: 4,
        origin: "learner",
      },
      current: 2,
    });
  });

  it("keeps control navigation silent by origin and treats the presented page as idempotent", async () => {
    const controller = createPdfEmbedRuntimeController();
    const requestPage = vi.fn();
    controller.attachRequestPage(requestPage);
    controller.load(3);
    controller.present(1);
    const presentations: unknown[] = [];
    controller.subscribeToPresentations((presentation) => presentations.push(presentation));

    await expect(
      controller.navigateTo(1, "control-command", new AbortController().signal),
    ).resolves.toEqual({ kind: "success" });
    expect(requestPage).not.toHaveBeenCalled();

    const navigation = controller.navigateTo(3, "control-command", new AbortController().signal);
    controller.present(3);
    await expect(navigation).resolves.toEqual({ kind: "success" });
    expect(presentations).toEqual([
      {
        previousPageNumber: 1,
        pageNumber: 3,
        pageCount: 3,
        origin: "control-command",
      },
    ]);
  });

  it("supersedes an in-flight request when navigation returns to the already-presented page", async () => {
    const controller = createPdfEmbedRuntimeController();
    const requestPage = vi.fn();
    controller.attachRequestPage(requestPage);
    controller.load(3);
    controller.present(1);

    const obsolete = controller.navigateTo(2, "learner", new AbortController().signal);
    const returnToCurrent = controller.navigateTo(
      1,
      "control-command",
      new AbortController().signal,
    );

    await expect(obsolete).resolves.toEqual({ kind: "cancelled" });
    await expect(returnToCurrent).resolves.toEqual({ kind: "success" });
    expect(requestPage).toHaveBeenNthCalledWith(1, 2);
    expect(requestPage).toHaveBeenNthCalledWith(2, 1);
    expect(controller.getPresentedPageNumber()).toBe(1);
  });

  it("returns reason-specific private-range and availability failures", async () => {
    const controller = createPdfEmbedRuntimeController();
    controller.attachRequestPage(vi.fn());

    await expect(
      controller.navigateTo(2, "control-command", new AbortController().signal),
    ).resolves.toEqual({ kind: "pdf-unavailable", requestedPage: 2 });

    controller.load(4);
    controller.present(1);
    await expect(
      controller.navigateTo(5, "control-command", new AbortController().signal),
    ).resolves.toEqual({
      kind: "page-out-of-range",
      requestedPage: 5,
      pageCount: 4,
    });
  });

  it("cancels pre-aborted and mid-flight navigation without promoting later render causation", async () => {
    const controller = createPdfEmbedRuntimeController();
    const requestPage = vi.fn();
    controller.attachRequestPage(requestPage);
    controller.load(3);
    controller.present(1);
    const presentations: unknown[] = [];
    controller.subscribeToPresentations((presentation) => presentations.push(presentation));

    const preAborted = new AbortController();
    preAborted.abort();
    await expect(controller.navigateTo(2, "control-command", preAborted.signal)).resolves.toEqual({
      kind: "cancelled",
    });
    expect(requestPage).not.toHaveBeenCalled();

    const midFlight = new AbortController();
    const navigation = controller.navigateTo(2, "control-command", midFlight.signal);
    midFlight.abort();
    await expect(navigation).resolves.toEqual({ kind: "cancelled" });
    controller.present(2);
    expect(presentations).toEqual([
      {
        previousPageNumber: 1,
        pageNumber: 2,
        pageCount: 3,
        origin: "reconciliation",
      },
    ]);
  });

  it("makes failure and source reset unavailable without fabricating a presentation", async () => {
    const controller = createPdfEmbedRuntimeController();
    const detach = controller.attachRequestPage(vi.fn());
    controller.load(2);
    controller.present(1);
    const navigation = controller.navigateTo(2, "control-command", new AbortController().signal);

    controller.fail();
    await expect(navigation).resolves.toEqual({ kind: "pdf-unavailable", requestedPage: 2 });
    expect(controller.isReady()).toBe(false);
    expect(controller.getPresentedPageNumber()).toBeNull();

    controller.load(5);
    controller.present(3);
    expect(controller.isReady()).toBe(true);
    controller.reset();
    expect(controller.isReady()).toBe(false);
    expect(controller.getPageCount()).toBeNull();
    detach();
  });

  it("notifies readiness loss when the mounted page request authority detaches", () => {
    const controller = createPdfEmbedRuntimeController();
    const readiness: boolean[] = [];
    controller.subscribeToAvailability((ready) => readiness.push(ready));
    const detach = controller.attachRequestPage(vi.fn());
    controller.load(2);
    controller.present(1);

    expect(readiness).toEqual([true]);
    detach();
    expect(readiness).toEqual([true, false]);
  });

  it("keeps programming defects observable", () => {
    const controller = createPdfEmbedRuntimeController();
    expect(() => controller.load(0)).toThrow("PDF page count must be a positive integer.");
    controller.attachRequestPage(vi.fn());
    controller.load(2);
    expect(() => controller.present(3)).toThrow(
      "PDF presented page 3 is outside the loaded page count 2.",
    );
  });
});
