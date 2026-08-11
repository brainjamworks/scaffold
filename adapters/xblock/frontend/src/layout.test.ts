// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { ScaffoldAuthoringEntryProps } from "@scaffold/core/authoring";
import type { ScaffoldApplication } from "@scaffold/core/extensions";

import { applyStudioLayoutCompat } from "./layout";
import { createScaffoldArtifact, ScaffoldArtifactSchema } from "@scaffold/core/format";
import type { ScaffoldXBlockInnerInitPayload } from "./types";
import { XBlockStudioApp } from "./inner/XBlockStudioApp";
import type { XBlockInnerBridge } from "./inner/xblock-inner-bridge";

const studioMountMocks = vi.hoisted(() => ({
  applications: [] as ScaffoldApplication[],
  authoringEntryProps: [] as ScaffoldAuthoringEntryProps[],
  saveNow: vi.fn(async () => true),
}));

const mountedRoots: Root[] = [];

vi.mock("@scaffold/core/extensions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scaffold/core/extensions")>();

  return {
    ...actual,
    createScaffoldApplication: () => {
      const application = actual.createScaffoldApplication();
      studioMountMocks.applications.push(application);
      return application;
    },
  };
});

vi.mock("@scaffold/core/authoring", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scaffold/core/authoring")>();

  return {
    ...actual,
    ScaffoldAuthoringEntry: (props: ScaffoldAuthoringEntryProps) => {
      studioMountMocks.authoringEntryProps.push(props);
      const slots = props.hostHeaderActions?.({
        preview: false,
        saveNow: studioMountMocks.saveNow,
        saveState: "idle",
        title: "Studio content",
      });
      return createElement(
        "section",
        { "data-testid": "authoring-entry-actions" },
        slots?.beforePublish,
        createElement("button", { type: "button" }, "Core Publish"),
        slots?.afterPublish,
      );
    },
  };
});

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    root.unmount();
  }
  document.body.innerHTML = "";
  studioMountMocks.authoringEntryProps.length = 0;
  vi.restoreAllMocks();
});

beforeEach(() => {
  studioMountMocks.saveNow.mockReset().mockResolvedValue(true);
});

function renderModal({
  fullscreenButton = false,
  alreadyFullscreen = false,
}: {
  fullscreenButton?: boolean;
  alreadyFullscreen?: boolean;
} = {}): HTMLElement {
  document.body.innerHTML = `
    <div class="modal-type-scaffold modal-window modal-editor${alreadyFullscreen ? " modal-fullscreen" : ""}">
      <div class="modal-content">
        ${fullscreenButton ? '<button type="button" class="fullscreen-button">Fullscreen</button>' : ""}
        <div class="xblock-studio_view">
          <div class="scaffold-xblock scaffold-studio"></div>
        </div>
      </div>
    </div>
  `;

  const mount = document.querySelector<HTMLElement>(".scaffold-xblock");
  if (!mount) throw new Error("Missing test mount.");
  return mount;
}

describe("applyStudioLayoutCompat", () => {
  it("applies the scoped fullscreen fallback when released Teak has no native button", () => {
    const mount = renderModal();

    applyStudioLayoutCompat(mount);

    const modal = document.querySelector<HTMLElement>(".modal-type-scaffold");
    expect(modal?.classList.contains("sc-xblock-host-modal")).toBe(true);
    expect(modal?.classList.contains("sc-xblock-host-modal-fallback")).toBe(true);
  });

  it("uses native Open edX fullscreen when the button is available", () => {
    const mount = renderModal({ fullscreenButton: true });
    const button = document.querySelector<HTMLButtonElement>(".fullscreen-button");
    const clickSpy = vi.spyOn(button as HTMLButtonElement, "click");
    button?.addEventListener("click", () => {
      button.closest(".modal-type-scaffold")?.classList.add("modal-fullscreen");
    });

    applyStudioLayoutCompat(mount);

    const modal = document.querySelector<HTMLElement>(".modal-type-scaffold");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(modal?.classList.contains("sc-xblock-host-modal")).toBe(true);
    expect(modal?.classList.contains("modal-fullscreen")).toBe(true);
    expect(modal?.classList.contains("sc-xblock-host-modal-fallback")).toBe(false);
  });

  it("does not apply the fallback when the modal is already fullscreen", () => {
    const mount = renderModal({
      fullscreenButton: true,
      alreadyFullscreen: true,
    });
    const button = document.querySelector<HTMLButtonElement>(".fullscreen-button");
    const clickSpy = vi.spyOn(button as HTMLButtonElement, "click");

    applyStudioLayoutCompat(mount);

    const modal = document.querySelector<HTMLElement>(".modal-type-scaffold");
    expect(clickSpy).not.toHaveBeenCalled();
    expect(modal?.classList.contains("sc-xblock-host-modal")).toBe(true);
    expect(modal?.classList.contains("sc-xblock-host-modal-fallback")).toBe(false);
  });

  it("does nothing outside an Open edX Studio modal", () => {
    const mount = document.createElement("div");
    document.body.append(mount);

    expect(() => applyStudioLayoutCompat(mount)).not.toThrow();
    expect(document.querySelector(".sc-xblock-host-modal")).toBeNull();
  });
});

describe("XBlockStudioApp mounted configuration", () => {
  it("mounts the exact module-stable complete Core application", () => {
    const data = createStudioData();
    const bridge = createBridgeStub();

    renderToStaticMarkup(createElement(XBlockStudioApp, { data, bridge }));
    renderToStaticMarkup(createElement(XBlockStudioApp, { data, bridge }));

    expect(studioMountMocks.applications).toHaveLength(1);
    expect(studioMountMocks.authoringEntryProps).toHaveLength(2);
    expect(studioMountMocks.authoringEntryProps[0]?.application).toBe(
      studioMountMocks.applications[0],
    );
    expect(studioMountMocks.authoringEntryProps[1]?.application).toBe(
      studioMountMocks.applications[0],
    );
    const props = studioMountMocks.authoringEntryProps[0];
    expect(props?.headerActions).toBeUndefined();
    const slots = props?.hostHeaderActions?.({
      preview: false,
      saveNow: studioMountMocks.saveNow,
      saveState: "idle",
      title: "Studio content",
    });
    const actionsMarkup = renderToStaticMarkup(
      createElement("div", null, slots?.beforePublish, "Core Publish", slots?.afterPublish),
    );
    expect(actionsMarkup).toContain(">Save</button>");
    expect(actionsMarkup).toContain("Core Publish");
    expect(actionsMarkup).toContain(">Done</button>");
  });

  it("orders one manual save lifecycle and rejects an overlapping Done operation", async () => {
    const events: string[] = [];
    const saveResult = createDeferred<boolean>();
    studioMountMocks.saveNow.mockImplementation(() => {
      events.push("saveNow");
      return saveResult.promise;
    });
    const bridge = createBridgeStub((type) => {
      events.push(type);
      return Promise.resolve();
    });
    const host = renderStudioApp(createStudioData(), bridge);

    clickButton(host, "Save");
    await waitForCondition(() => studioMountMocks.saveNow.mock.calls.length === 1);
    clickButton(host, "Done");

    expect(events).toEqual(["host.notifySaveStart", "saveNow"]);

    saveResult.resolve(true);
    await waitForCondition(() => events.includes("host.notifySaveEnd"));
    expect(events).toEqual(["host.notifySaveStart", "saveNow", "host.notifySaveEnd"]);
    expect(events).not.toContain("host.done");
  });

  it("sends Done only after its own successful start-save-end lifecycle", async () => {
    const events: string[] = [];
    studioMountMocks.saveNow.mockImplementation(async () => {
      events.push("saveNow");
      return true;
    });
    const bridge = createBridgeStub((type) => {
      events.push(type);
      return Promise.resolve();
    });
    const host = renderStudioApp(createStudioData(), bridge);

    clickButton(host, "Done");
    await waitForCondition(() => events.includes("host.done"));

    expect(events).toEqual(["host.notifySaveStart", "saveNow", "host.notifySaveEnd", "host.done"]);
  });

  it("releases the manual-operation guard when a lifecycle request rejects", async () => {
    let saveStartCalls = 0;
    const requestTypes: string[] = [];
    const bridge = createBridgeStub((type) => {
      requestTypes.push(type);
      if (type === "host.notifySaveStart") {
        saveStartCalls += 1;
        if (saveStartCalls === 1) return Promise.reject(new Error("host unavailable"));
      }
      return Promise.resolve();
    });
    const host = renderStudioApp(createStudioData(), bridge);

    clickButton(host, "Save");
    await waitForCondition(() => saveStartCalls === 1);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    clickButton(host, "Save");
    await waitForCondition(() => studioMountMocks.saveNow.mock.calls.length === 1);

    expect(saveStartCalls).toBe(2);
    expect(requestTypes).toContain("host.notifySaveEnd");
  });
});

function createStudioData(): ScaffoldXBlockInnerInitPayload {
  return {
    view: "studio",
    artifactAccess: {
      status: "supported",
      artifact: {
        id: "xblock-studio-artifact",
        title: "Studio content",
        mode: "page",
      },
    },
    artifact: ScaffoldArtifactSchema.parse(
      createScaffoldArtifact({
        id: "xblock-studio-artifact",
        title: "Studio content",
        mode: "page",
        surfaceId: "surfac_00001",
      }),
    ),
    initialLearnerState: {},
    learnerPublication: {
      status: "invalid",
      issues: [{ code: "studio", message: "Not a learner view.", path: [] }],
    },
    publicationStatus: {
      currentArtifactRevision: "revision-2",
      publishedArtifactRevision: "revision-1",
      publishedAt: "2026-08-09T10:00:00Z",
    },
  };
}

function renderStudioApp(data: ScaffoldXBlockInnerInitPayload, bridge: XBlockInnerBridge) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  flushSync(() => root.render(createElement(XBlockStudioApp, { data, bridge })));
  return host;
}

function clickButton(host: HTMLElement, name: string): void {
  const button = Array.from(host.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === name,
  );
  if (!button) throw new Error(`Missing ${name} button`);
  button.click();
}

function createBridgeStub(
  requestImplementation: (type: string) => Promise<unknown> = () => Promise.resolve(),
): XBlockInnerBridge {
  const request = vi.fn(requestImplementation) as unknown as XBlockInnerBridge["request"];
  return {
    destroy: vi.fn(),
    request,
    sendReady: vi.fn(),
    reportHeight: vi.fn(),
    requestHostScroll: vi.fn(),
    reportDirty: vi.fn(),
    reportFatalError: vi.fn(),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 2_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Studio actions");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
}
