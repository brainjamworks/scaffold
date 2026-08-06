// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { createClientPoint } from "../model/coordinate-space";
import { createOwnerDocumentPointerTracker } from "./owner-document-pointer-tracker";

describe("createOwnerDocumentPointerTracker", () => {
  it("tracks only genuine activation and pointer movement in the supplied document", () => {
    const tracker = createOwnerDocumentPointerTracker(document);
    expect(tracker.getLatestClientPoint()).toBeNull();

    tracker.start(createClientPoint(12, 24)!);
    tracker.start(createClientPoint(90, 100)!);
    expect(tracker.getLatestClientPoint()).toEqual({ space: "client", x: 12, y: 24 });

    document.dispatchEvent(pointerEvent("pointerdown", 18, 30));
    expect(tracker.getLatestClientPoint()).toEqual({ space: "client", x: 12, y: 24 });

    document.dispatchEvent(pointerEvent("pointermove", 36, 48));
    expect(tracker.getLatestClientPoint()).toEqual({ space: "client", x: 36, y: 48 });

    const foreignDocument = document.implementation.createHTMLDocument("foreign");
    foreignDocument.dispatchEvent(pointerEvent("pointermove", 90, 100));
    expect(tracker.getLatestClientPoint()).toEqual({ space: "client", x: 36, y: 48 });
  });

  it("clears on owner-window blur and stops idempotently", () => {
    const tracker = createOwnerDocumentPointerTracker(document);
    tracker.start(createClientPoint(10, 15)!);
    document.dispatchEvent(pointerEvent("pointermove", 20, 30));

    window.dispatchEvent(new Event("blur"));
    expect(tracker.getLatestClientPoint()).toBeNull();

    tracker.stop();
    tracker.stop();
    document.dispatchEvent(pointerEvent("pointermove", 40, 50));
    expect(tracker.getLatestClientPoint()).toBeNull();
  });
});

function pointerEvent(type: string, clientX: number, clientY: number): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  return event;
}
