import { createClientPoint, type ClientPoint } from "../model/coordinate-space";

export interface OwnerDocumentPointerTracker {
  start(): void;
  stop(): void;
  getLatestClientPoint(): ClientPoint | null;
}

export function createOwnerDocumentPointerTracker(
  ownerDocument: Document,
): OwnerDocumentPointerTracker {
  const ownerWindow = ownerDocument.defaultView;
  let latestClientPoint: ClientPoint | null = null;
  let started = false;

  const handlePointerInput: EventListener = (event) => {
    const pointerEvent = event as Event & { clientX?: unknown; clientY?: unknown };
    if (typeof pointerEvent.clientX !== "number" || typeof pointerEvent.clientY !== "number") {
      return;
    }
    latestClientPoint = createClientPoint(pointerEvent.clientX, pointerEvent.clientY);
  };
  const handleBlur = () => {
    latestClientPoint = null;
  };

  return {
    start() {
      if (started) return;
      started = true;
      ownerDocument.addEventListener("pointerdown", handlePointerInput, true);
      ownerDocument.addEventListener("pointermove", handlePointerInput, true);
      ownerWindow?.addEventListener("blur", handleBlur);
    },
    stop() {
      if (!started) return;
      started = false;
      ownerDocument.removeEventListener("pointerdown", handlePointerInput, true);
      ownerDocument.removeEventListener("pointermove", handlePointerInput, true);
      ownerWindow?.removeEventListener("blur", handleBlur);
      latestClientPoint = null;
    },
    getLatestClientPoint() {
      return latestClientPoint;
    },
  };
}
