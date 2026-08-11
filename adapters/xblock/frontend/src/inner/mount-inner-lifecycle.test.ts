// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ScaffoldApplication } from "@scaffold/core/extensions";
import type { ScaffoldLearnerPublication } from "@scaffold/core/ports";
import type { ScaffoldLearnerAppProps } from "@scaffold/core/runtime";

import {
  installWheelScrollForwarding,
  mountXBlockInner,
  readDocumentHeight,
} from "./mount-inner-lifecycle";
import { createScaffoldArtifact, ScaffoldArtifactSchema } from "@scaffold/core/format";
import type { ScaffoldXBlockInnerInitPayload } from "../types";
import { XBlockStudentApp } from "./XBlockStudentApp";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";
import { createXBlockBridgeLifecycleMessage } from "../bridge/protocol";

const studentMountMocks = vi.hoisted(() => ({
  applications: [] as ScaffoldApplication[],
  learnerAppProps: [] as ScaffoldLearnerAppProps[],
}));

vi.mock("@scaffold/core/extensions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scaffold/core/extensions")>();

  return {
    ...actual,
    createScaffoldApplication: () => {
      const application = actual.createScaffoldApplication();
      studentMountMocks.applications.push(application);
      return application;
    },
  };
});

vi.mock("@scaffold/core/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scaffold/core/runtime")>();

  return {
    ...actual,
    ScaffoldLearnerApp: (props: ScaffoldLearnerAppProps) => {
      studentMountMocks.learnerAppProps.push(props);
      return null;
    },
  };
});

describe("XBlockStudentApp mounted configuration", () => {
  beforeEach(() => {
    studentMountMocks.applications.length = 0;
    studentMountMocks.learnerAppProps.length = 0;
  });

  it("mounts the exact module-stable application runtime composition", () => {
    const data = {
      view: "student" as const,
      artifactAccess: {
        status: "supported" as const,
        artifact: {
          id: "xblock-student-artifact",
          title: "Student content",
          mode: "page" as const,
        },
      },
      artifact: ScaffoldArtifactSchema.parse(
        createScaffoldArtifact({
          id: "xblock-student-artifact",
          title: "Student content",
          mode: "page",
          surfaceId: "surfac_00002",
        }),
      ),
      initialLearnerState: {},
      learnerPublication: {
        status: "supported",
        learnerContent: ScaffoldArtifactSchema.parse(
          createScaffoldArtifact({ id: "usage-v1", title: "Scaffold", mode: "page" }),
        ).content!,
      },
    } satisfies ScaffoldXBlockInnerInitPayload;
    const bridge = createBridgeStub();

    renderToStaticMarkup(createElement(XBlockStudentApp, { data, bridge }));
    renderToStaticMarkup(createElement(XBlockStudentApp, { data, bridge }));

    expect(studentMountMocks.applications).toHaveLength(0);
    expect(studentMountMocks.learnerAppProps).toHaveLength(2);
    expect(studentMountMocks.learnerAppProps[1]?.composition).toBe(
      studentMountMocks.learnerAppProps[0]?.composition,
    );
    expect(studentMountMocks.learnerAppProps[0]?.bootstrap.publication).toBe(
      data.learnerPublication,
    );
    expect(studentMountMocks.learnerAppProps[0]?.productAccess).toEqual({
      scaffoldPlusAuthorized: false,
    });
  });

  it.each([
    {
      status: "unavailable-content",
      unavailableContent: [
        {
          kind: "block",
          capabilityId: "plus_private_block",
          stableId: "plusblock001",
          path: ["content", 0],
        },
      ],
    },
    {
      status: "invalid",
      issues: [{ code: "invalid_document", message: "Invalid document.", path: [] }],
    },
    {
      status: "unsupported-core-format",
      documentVersion: 5,
      supportedVersion: 4,
      message: "Future format.",
    },
  ] satisfies ScaffoldLearnerPublication[])(
    "passes the $status learner refusal through without authoring bootstrap",
    (learnerPublication) => {
      const data = {
        view: "student" as const,
        artifactAccess: {
          status: "supported" as const,
          artifact: { id: "usage-v1", title: "Scaffold", mode: "page" as const },
        },
        artifact: ScaffoldArtifactSchema.parse(
          createScaffoldArtifact({ id: "usage-v1", title: "Scaffold", mode: "page" }),
        ),
        initialLearnerState: {},
        learnerPublication,
      } satisfies ScaffoldXBlockInnerInitPayload;

      renderToStaticMarkup(createElement(XBlockStudentApp, { data, bridge: createBridgeStub() }));

      expect(studentMountMocks.applications).toHaveLength(0);
      expect(studentMountMocks.learnerAppProps).toHaveLength(1);
      expect(studentMountMocks.learnerAppProps[0]?.bootstrap.publication).toBe(learnerPublication);
    },
  );
});

describe("mountXBlockInner product refusal", () => {
  it("renders the safe Plus refusal without invoking the application mount", () => {
    document.body.innerHTML = '<div id="scaffold-xblock-inner-root"></div>';
    window.history.replaceState(
      {},
      "",
      "?sessionId=session-1&parentOrigin=https%3A%2F%2Fstudio.example",
    );
    const mount = vi.fn();
    const addDocumentListener = document.addEventListener.bind(document);
    const addEventListener = vi
      .spyOn(document, "addEventListener")
      .mockImplementation((type, listener, options) => {
        if (type !== "wheel") addDocumentListener(type, listener, options);
      });

    mountXBlockInner({ view: "studio", mount });
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://studio.example",
        source: window.parent,
        data: createXBlockBridgeLifecycleMessage({
          sessionId: "session-1",
          type: "outer.init",
          payload: {
            view: "studio",
            artifactAccess: {
              status: "requires-scaffold-plus",
              artifact: { id: "usage-v1", title: "Scaffold", mode: "page" },
            },
            artifact: null,
            initialLearnerState: {},
            learnerPublication: { status: "requires-scaffold-plus" },
          },
        }),
      }),
    );
    addEventListener.mockRestore();

    expect(mount).not.toHaveBeenCalled();
    expect(document.getElementById("scaffold-xblock-inner-root")?.textContent).toContain(
      "This course requires Scaffold Plus.",
    );
  });
});

describe("readDocumentHeight", () => {
  beforeEach(() => {
    setElementBox(document.documentElement, { scrollHeight: 900, offsetHeight: 880 });
    setElementBox(document.body, { scrollHeight: 860, offsetHeight: 840 });
  });

  it("uses a short rendered root instead of viewport-sized document boxes", () => {
    const root = document.createElement("div");
    document.body.append(root);
    setElementBox(root, { scrollHeight: 148, offsetHeight: 144, clientHeight: 140 });

    expect(readDocumentHeight(root)).toBe(148);
  });

  it("allows an empty rendered root to report zero", () => {
    const root = document.createElement("div");
    document.body.append(root);
    setElementBox(root, { scrollHeight: 0, offsetHeight: 0, clientHeight: 0 });

    expect(readDocumentHeight(root)).toBe(0);
  });

  it("reports the full height of a tall rendered root", () => {
    const root = document.createElement("div");
    document.body.append(root);
    setElementBox(root, { scrollHeight: 1077, offsetHeight: 1060, clientHeight: 1050 });

    expect(readDocumentHeight(root)).toBe(1077);
  });
});

describe("installWheelScrollForwarding", () => {
  it("forwards otherwise unconsumed vertical wheel movement", () => {
    const requestHostScroll = vi.fn();
    const cleanup = installWheelScrollForwarding(document, requestHostScroll);
    const target = document.createElement("div");
    document.body.append(target);
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 84 });

    target.dispatchEvent(event);

    expect(requestHostScroll).toHaveBeenCalledWith(84);
    expect(event.defaultPrevented).toBe(true);
    cleanup();
  });

  it("leaves movement with a nested region that can scroll in that direction", () => {
    const requestHostScroll = vi.fn();
    const cleanup = installWheelScrollForwarding(document, requestHostScroll);
    const region = scrollableRegion({ scrollTop: 40 });
    const target = document.createElement("div");
    region.append(target);
    document.body.append(region);
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 84 });

    target.dispatchEvent(event);

    expect(requestHostScroll).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    cleanup();
  });

  it("forwards movement after a nested region reaches its boundary", () => {
    const requestHostScroll = vi.fn();
    const cleanup = installWheelScrollForwarding(document, requestHostScroll);
    const region = scrollableRegion({ scrollTop: 200 });
    const target = document.createElement("div");
    region.append(target);
    document.body.append(region);
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 84 });

    target.dispatchEvent(event);

    expect(requestHostScroll).toHaveBeenCalledWith(84);
    expect(event.defaultPrevented).toBe(true);
    cleanup();
  });

  it("does not intercept browser zoom gestures", () => {
    const requestHostScroll = vi.fn();
    const cleanup = installWheelScrollForwarding(document, requestHostScroll);
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: 84,
    });

    document.body.dispatchEvent(event);

    expect(requestHostScroll).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    cleanup();
  });

  it("does not intercept horizontal wheel gestures", () => {
    const requestHostScroll = vi.fn();
    const cleanup = installWheelScrollForwarding(document, requestHostScroll);
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 84,
      deltaY: 12,
    });

    document.body.dispatchEvent(event);

    expect(requestHostScroll).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    cleanup();
  });
});

function setElementBox(
  element: Element,
  dimensions: Partial<Record<"scrollHeight" | "offsetHeight" | "clientHeight", number>>,
): void {
  for (const [property, value] of Object.entries(dimensions)) {
    Object.defineProperty(element, property, {
      configurable: true,
      value,
    });
  }
}

function scrollableRegion({ scrollTop }: { scrollTop: number }): HTMLElement {
  const region = document.createElement("div");
  region.style.overflowY = "auto";
  setElementBox(region, { scrollHeight: 300, clientHeight: 100 });
  Object.defineProperty(region, "scrollTop", {
    configurable: true,
    writable: true,
    value: scrollTop,
  });
  return region;
}

function createBridgeStub(): XBlockInnerBridge {
  return {
    destroy: vi.fn(),
    request: vi.fn(),
    sendReady: vi.fn(),
    reportHeight: vi.fn(),
    requestHostScroll: vi.fn(),
    reportDirty: vi.fn(),
    reportFatalError: vi.fn(),
  };
}
