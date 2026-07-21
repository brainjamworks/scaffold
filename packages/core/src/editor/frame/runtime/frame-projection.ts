export const RUNTIME_FRAME_ATTR = "data-runtime-frame";

export function runtimeFrameAttributes(frameKind: string): Record<string, string> {
  return { [RUNTIME_FRAME_ATTR]: frameKind };
}
