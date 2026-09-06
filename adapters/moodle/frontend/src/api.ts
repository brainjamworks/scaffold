interface MoodleAjaxBridge {
  call: <T>(methodName: string, args: Record<string, unknown>) => Promise<T>;
}

declare global {
  interface Window {
    ScaffoldMoodleAjax?: MoodleAjaxBridge;
  }
}

export interface MoodleAjaxResponse {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

export class MoodleServiceError extends Error {
  constructor(
    message: string,
    readonly service: {
      errorCode: string | null;
      debugInfo: string | null;
      exceptionName: string | null;
    } = { errorCode: null, debugInfo: null, exceptionName: null },
  ) {
    super(message);
    this.name = "MoodleServiceError";
  }
}

export async function moodleCall<T extends MoodleAjaxResponse>(
  methodName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const bridge = window.ScaffoldMoodleAjax;
  if (!bridge) {
    throw new Error("Moodle AJAX bridge is not available");
  }

  const body = await bridge.call<T>(methodName, args);
  if (body.success === false) {
    throw new MoodleServiceError(
      typeof body.error === "string" ? body.error : `Moodle service failed: ${methodName}`,
    );
  }
  return body;
}

export function parseJsonField(value: unknown, fallback: unknown): unknown {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
