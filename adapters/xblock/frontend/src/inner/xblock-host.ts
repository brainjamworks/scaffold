import type { XBlockInnerBridge } from "./xblock-inner-bridge";

export function notifyXBlockSaveStart(
  bridge: XBlockInnerBridge,
  message = "Saving Scaffold content",
): Promise<unknown> {
  return bridge.request("host.notifySaveStart", { message });
}

export function notifyXBlockSaveEnd(bridge: XBlockInnerBridge): Promise<unknown> {
  return bridge.request("host.notifySaveEnd", {});
}

export function notifyXBlockDone(bridge: XBlockInnerBridge): Promise<unknown> {
  return bridge.request("host.done", {});
}
