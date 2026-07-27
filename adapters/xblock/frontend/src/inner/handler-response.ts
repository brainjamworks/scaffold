export type BridgeHandlerResponse = {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
};

export function unwrapXBlockHandlerResponse(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("XBlock assessment handler returned an invalid response");
  }

  const handlerResponse = response as BridgeHandlerResponse;
  if (handlerResponse.success === false) {
    throw new Error(
      typeof handlerResponse.error === "string"
        ? handlerResponse.error
        : "XBlock assessment handler rejected the request",
    );
  }
  const { success: _success, error: _error, ...payload } = handlerResponse;
  return payload;
}
