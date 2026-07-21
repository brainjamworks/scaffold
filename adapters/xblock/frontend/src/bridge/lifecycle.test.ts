import { describe, expect, it } from "vite-plus/test";

import {
  createXBlockBridgeLifecycleMessage,
  type XBlockBridgeEventLike,
  type XBlockBridgeMessage,
} from "./protocol";
import { createXBlockInnerBridge } from "../inner/xblock-inner-bridge";
import {
  createXBlockOuterBridge,
  type XBlockBridgeMessageHost,
  type XBlockBridgeMessageListener,
  type XBlockBridgeWindowTarget,
} from "../outer/xblock-outer-bridge";

describe("XBlock iframe lifecycle bridge", () => {
  it("sends outer.init after inner.ready from the expected origin and source", () => {
    const innerWindow = new FakeWindowTarget();
    const outerHost = new FakeMessageHost();
    const innerSource = {};
    const readyPayload = { height: 512 };
    const initPayload = { artifact: { id: "artifact-1" } };
    const readyEvents: unknown[] = [];

    createXBlockOuterBridge({
      sessionId: "session-1",
      expectedInnerOrigin: "https://studio.example",
      expectedInnerSource: innerSource,
      innerWindow,
      messageHost: outerHost,
      initPayload,
      onReady(payload) {
        readyEvents.push(payload);
      },
    });

    outerHost.emit({
      data: createXBlockBridgeLifecycleMessage({
        sessionId: "session-1",
        type: "inner.ready",
        payload: readyPayload,
      }),
      origin: "https://studio.example",
      source: innerSource,
    });

    expect(readyEvents).toEqual([readyPayload]);
    expect(innerWindow.sent).toEqual([
      {
        message: createXBlockBridgeLifecycleMessage({
          sessionId: "session-1",
          type: "outer.init",
          payload: initPayload,
        }),
        targetOrigin: "https://studio.example",
      },
    ]);
  });

  it("ignores inner.ready from the wrong origin or source", () => {
    const innerWindow = new FakeWindowTarget();
    const outerHost = new FakeMessageHost();
    const innerSource = {};

    createXBlockOuterBridge({
      sessionId: "session-1",
      expectedInnerOrigin: "https://studio.example",
      expectedInnerSource: innerSource,
      innerWindow,
      messageHost: outerHost,
      initPayload: {},
    });

    const ready = createXBlockBridgeLifecycleMessage({
      sessionId: "session-1",
      type: "inner.ready",
      payload: {},
    });

    outerHost.emit({
      data: ready,
      origin: "https://evil.example",
      source: innerSource,
    });
    outerHost.emit({
      data: ready,
      origin: "https://studio.example",
      source: {},
    });

    expect(innerWindow.sent).toEqual([]);
  });

  it("reports height and dirty-state lifecycle messages to the outer shell", () => {
    const innerWindow = new FakeWindowTarget();
    const outerHost = new FakeMessageHost();
    const innerSource = {};
    const heights: number[] = [];
    const dirtyStates: boolean[] = [];

    createXBlockOuterBridge({
      sessionId: "session-1",
      expectedInnerOrigin: "https://studio.example",
      expectedInnerSource: innerSource,
      innerWindow,
      messageHost: outerHost,
      initPayload: {},
      onHeightChanged(height) {
        heights.push(height);
      },
      onDirtyChanged(dirty) {
        dirtyStates.push(dirty);
      },
    });

    outerHost.emit({
      data: createXBlockBridgeLifecycleMessage({
        sessionId: "session-1",
        type: "inner.heightChanged",
        payload: { height: 481.2 },
      }),
      origin: "https://studio.example",
      source: innerSource,
    });
    outerHost.emit({
      data: createXBlockBridgeLifecycleMessage({
        sessionId: "session-1",
        type: "inner.dirtyChanged",
        payload: { dirty: true },
      }),
      origin: "https://studio.example",
      source: innerSource,
    });

    expect(heights).toEqual([482]);
    expect(dirtyStates).toEqual([true]);
  });

  it("inner bridge sends ready and height messages to the expected parent origin", () => {
    const parentWindow = new FakeWindowTarget();
    const innerHost = new FakeMessageHost();

    createXBlockInnerBridge({
      sessionId: "session-1",
      expectedParentOrigin: "https://studio.example",
      parentWindow,
      parentSource: {},
      messageHost: innerHost,
      onInit() {},
    }).sendReady({ height: 300 });

    createXBlockInnerBridge({
      sessionId: "session-2",
      expectedParentOrigin: "https://studio.example",
      parentWindow,
      parentSource: {},
      messageHost: innerHost,
      onInit() {},
    }).reportHeight(299.1);

    expect(parentWindow.sent).toEqual([
      {
        message: createXBlockBridgeLifecycleMessage({
          sessionId: "session-1",
          type: "inner.ready",
          payload: { height: 300 },
        }),
        targetOrigin: "https://studio.example",
      },
      {
        message: createXBlockBridgeLifecycleMessage({
          sessionId: "session-2",
          type: "inner.heightChanged",
          payload: { height: 300 },
        }),
        targetOrigin: "https://studio.example",
      },
    ]);
  });

  it("inner bridge accepts outer.init from the expected parent only", () => {
    const parentWindow = new FakeWindowTarget();
    const innerHost = new FakeMessageHost();
    const parentSource = {};
    const initPayloads: unknown[] = [];
    const initMessage = createXBlockBridgeLifecycleMessage({
      sessionId: "session-1",
      type: "outer.init",
      payload: { artifact: { id: "artifact-1" } },
    });

    createXBlockInnerBridge({
      sessionId: "session-1",
      expectedParentOrigin: "https://studio.example",
      parentWindow,
      parentSource,
      messageHost: innerHost,
      onInit(payload) {
        initPayloads.push(payload);
      },
    });

    innerHost.emit({
      data: initMessage,
      origin: "https://evil.example",
      source: parentSource,
    });
    innerHost.emit({
      data: initMessage,
      origin: "https://studio.example",
      source: {},
    });
    innerHost.emit({
      data: initMessage,
      origin: "https://studio.example",
      source: parentSource,
    });

    expect(initPayloads).toEqual([{ artifact: { id: "artifact-1" } }]);
  });

  it("routes inner requests to the outer bridge and resolves outer responses", async () => {
    const parentWindow = new FakeWindowTarget();
    const innerWindow = new FakeWindowTarget();
    const outerHost = new FakeMessageHost();
    const innerHost = new FakeMessageHost();
    const innerSource = {};
    const parentSource = {};
    let outerBridge: ReturnType<typeof createXBlockOuterBridge>;

    outerBridge = createXBlockOuterBridge({
      sessionId: "session-1",
      expectedInnerOrigin: "https://scaffold.example",
      expectedInnerSource: innerSource,
      innerWindow,
      messageHost: outerHost,
      initPayload: {},
      onRequest(request) {
        outerBridge.sendSuccessResponse({
          requestId: request.requestId,
          result: { url: "https://cdn.example/media.png" },
        });
      },
    });

    const innerBridge = createXBlockInnerBridge({
      sessionId: "session-1",
      expectedParentOrigin: "https://studio.example",
      parentWindow,
      parentSource,
      messageHost: innerHost,
      onInit() {},
    });

    const resultPromise = innerBridge.request("media.resolve", {
      mediaId: "media-1",
    });
    expect(parentWindow.sent).toHaveLength(1);

    outerHost.emit({
      data: parentWindow.sent[0]?.message,
      origin: "https://scaffold.example",
      source: innerSource,
    });
    expect(innerWindow.sent).toHaveLength(1);

    innerHost.emit({
      data: innerWindow.sent[0]?.message,
      origin: "https://studio.example",
      source: parentSource,
    });

    await expect(resultPromise).resolves.toEqual({
      url: "https://cdn.example/media.png",
    });
  });

  it("removes message listeners when bridges are destroyed", () => {
    const innerWindow = new FakeWindowTarget();
    const outerHost = new FakeMessageHost();
    const innerSource = {};
    const bridge = createXBlockOuterBridge({
      sessionId: "session-1",
      expectedInnerOrigin: "https://studio.example",
      expectedInnerSource: innerSource,
      innerWindow,
      messageHost: outerHost,
      initPayload: {},
    });

    expect(outerHost.listenerCount).toBe(1);
    bridge.destroy();
    expect(outerHost.listenerCount).toBe(0);
  });
});

class FakeWindowTarget implements XBlockBridgeWindowTarget {
  readonly sent: Array<{
    message: XBlockBridgeMessage;
    targetOrigin: string;
  }> = [];

  postMessage(message: XBlockBridgeMessage, targetOrigin: string): void {
    this.sent.push({ message, targetOrigin });
  }
}

class FakeMessageHost implements XBlockBridgeMessageHost {
  private readonly listeners = new Set<XBlockBridgeMessageListener>();

  get listenerCount(): number {
    return this.listeners.size;
  }

  addMessageListener(listener: XBlockBridgeMessageListener): void {
    this.listeners.add(listener);
  }

  removeMessageListener(listener: XBlockBridgeMessageListener): void {
    this.listeners.delete(listener);
  }

  emit(event: XBlockBridgeEventLike): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
