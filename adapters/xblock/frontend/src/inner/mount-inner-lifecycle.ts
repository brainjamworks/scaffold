import { createXBlockInnerBridge } from "./xblock-inner-bridge";
import type { ScaffoldXBlockInnerInitPayload, ScaffoldXBlockView } from "../types";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

interface MountXBlockInnerOptions {
  view: ScaffoldXBlockView;
  mount: (
    root: HTMLElement,
    payload: ScaffoldXBlockInnerInitPayload,
    bridge: XBlockInnerBridge,
  ) => void;
}

export function mountXBlockInner({ view, mount }: MountXBlockInnerOptions): void {
  const root = document.getElementById("scaffold-xblock-inner-root");
  if (!(root instanceof HTMLElement)) {
    throw new Error("Scaffold inner iframe root is missing.");
  }

  const params = new URL(window.location.href).searchParams;
  const sessionId = params.get("sessionId");
  const parentOrigin = params.get("parentOrigin");
  if (!sessionId || !parentOrigin) {
    renderFatalError(root, "Scaffold iframe is missing bridge parameters.");
    return;
  }

  let mounted = false;
  const bridge = createXBlockInnerBridge<ScaffoldXBlockInnerInitPayload>({
    sessionId,
    expectedParentOrigin: parentOrigin,
    parentWindow: window.parent,
    parentSource: window.parent,
    messageHost: {
      addMessageListener(listener) {
        window.addEventListener("message", listener);
      },
      removeMessageListener(listener) {
        window.removeEventListener("message", listener);
      },
    },
    onInit(payload) {
      if (mounted) return;
      if (payload.view !== view) {
        const message = `Scaffold iframe view mismatch: expected ${view}, received ${payload.view}.`;
        renderFatalError(root, message);
        bridge.reportFatalError({ message });
        return;
      }

      mounted = true;
      root.replaceChildren();
      mount(root, payload, bridge);
      reportHeight();
    },
  });

  const reportHeight = () => {
    bridge.reportHeight(readDocumentHeight(root));
  };

  const resizeObserver =
    typeof ResizeObserver === "function" ? new ResizeObserver(reportHeight) : null;
  resizeObserver?.observe(root);

  window.addEventListener("load", reportHeight);
  bridge.sendReady({ view, height: readDocumentHeight(root) });
}

export function readDocumentHeight(root?: HTMLElement | null): number {
  if (!(root instanceof HTMLElement)) return 0;
  return Math.max(root.scrollHeight, root.offsetHeight, root.clientHeight);
}

function renderFatalError(root: HTMLElement, message: string): void {
  root.replaceChildren();
  const alert = document.createElement("div");
  alert.className = "sc-xblock-root sc-xblock-error";
  alert.setAttribute("role", "alert");

  const title = document.createElement("strong");
  title.textContent = "Scaffold could not be loaded.";
  const details = document.createElement("span");
  details.textContent = message;

  alert.append(title, details);
  root.append(alert);
}
