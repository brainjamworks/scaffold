import type { AssessmentSubmitRequest } from "@scaffold/core/ports";

export const SCAFFOLD_XBLOCK_PROTOCOL_VERSION = 1;

export type XBlockHandlerElement = unknown;

export interface XBlockRuntime {
  handlerUrl: (element: XBlockHandlerElement, handlerName: string) => string;
  notify?: (eventName: string, data?: Record<string, unknown>) => void;
  element?: XBlockHandlerElement;
}

export interface XBlockHandlerResponse {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);

  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  return meta?.content ?? null;
}

export async function xblockPost<T extends XBlockHandlerResponse>(
  runtime: XBlockRuntime,
  element: XBlockHandlerElement,
  handlerName: string,
  payload: unknown,
): Promise<T> {
  const csrfToken = readCsrfToken();
  const response = await fetch(runtime.handlerUrl(element, handlerName), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
    },
    body: JSON.stringify(withProtocolVersion(payload)),
  });

  const body = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `XBlock handler failed: ${handlerName}`,
    );
  }

  if (body.success === false) {
    throw new Error(
      typeof body.error === "string" ? body.error : `XBlock handler failed: ${handlerName}`,
    );
  }

  return body;
}

function withProtocolVersion(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return {
      ...(payload as Record<string, unknown>),
      protocolVersion: SCAFFOLD_XBLOCK_PROTOCOL_VERSION,
    };
  }

  return {
    protocolVersion: SCAFFOLD_XBLOCK_PROTOCOL_VERSION,
    payload,
  };
}

export type SaveContentResponse = XBlockHandlerResponse & {
  artifact?: {
    title?: unknown;
  };
};

export type AssessmentSubmitPayload = AssessmentSubmitRequest;
