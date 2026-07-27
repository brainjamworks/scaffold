import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { XapiPort } from "@/host/ports";
import { useScaffoldArtifactIdentity } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { useXapiPort } from "@/host/providers/ScaffoldServicesProvider";

import { createXapiSession, type XapiSession } from "./session";

export type XapiSessionAccessor = () => XapiSession | null;

export interface XapiRuntimeProviderProps {
  readonly children?: ReactNode;
  readonly courseTitle?: string | null;
}

interface XapiRuntimeScope {
  readonly artifactId: string;
  readonly port: XapiPort;
  readonly session: XapiSession | null;
  cleanupGeneration: number;
}

interface XapiRuntimeContextValue {
  readonly session: XapiSession | null;
  readonly getSession: XapiSessionAccessor;
}

const noSession: XapiSessionAccessor = () => null;
const unavailableContext = Object.freeze<XapiRuntimeContextValue>({
  session: null,
  getSession: noSession,
});
const XapiRuntimeContext = createContext<XapiRuntimeContextValue>(unavailableContext);

function createUuid(): string {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function createXapiRuntimeScope(
  artifactId: string | null,
  port: XapiPort | null,
  courseTitle: string | null | undefined,
): XapiRuntimeScope | null {
  if (!artifactId || !port) return null;

  let session: XapiSession | null = null;
  try {
    session = createXapiSession({
      port,
      courseTitle: courseTitle ?? "",
      createUuid,
      now: () => new Date(),
      monotonicNow: () => globalThis.performance.now(),
    });
  } catch {
    // Invalid host xAPI configuration makes recording unavailable, not learning unavailable.
  }

  return {
    artifactId,
    port,
    session,
    cleanupGeneration: 0,
  };
}

export function XapiRuntimeProvider({
  children,
  courseTitle,
}: XapiRuntimeProviderProps): ReactNode {
  const { artifactId } = useScaffoldArtifactIdentity();
  const port = useXapiPort();
  const [scope, setScope] = useState<XapiRuntimeScope | null>(() =>
    createXapiRuntimeScope(artifactId, port, courseTitle),
  );
  let currentScope = scope;
  const scopeMatches = currentScope
    ? currentScope.artifactId === artifactId && currentScope.port === port
    : artifactId === null || port === null;

  if (!scopeMatches) {
    currentScope = createXapiRuntimeScope(artifactId, port, courseTitle);
    setScope(currentScope);
  }

  const currentSession = currentScope?.session ?? null;
  const sessionRef = useRef<XapiSession | null>(currentSession);
  const getSession = useCallback<XapiSessionAccessor>(() => sessionRef.current, []);

  useLayoutEffect(() => {
    sessionRef.current = currentSession;
  }, [currentSession]);

  useEffect(() => {
    if (!currentScope?.session) return undefined;

    const closingScope = currentScope;
    const generation = closingScope.cleanupGeneration + 1;
    closingScope.cleanupGeneration = generation;

    return () => {
      void Promise.resolve().then(() => {
        if (closingScope.cleanupGeneration === generation) {
          void closingScope.session?.terminate();
        }
      });
    };
  }, [currentScope]);

  const value: XapiRuntimeContextValue = {
    session: currentSession,
    getSession,
  };

  return <XapiRuntimeContext.Provider value={value}>{children}</XapiRuntimeContext.Provider>;
}

export function useXapiSession(): XapiSession | null {
  return useContext(XapiRuntimeContext).session;
}

export function useXapiSessionAccessor(): XapiSessionAccessor {
  return useContext(XapiRuntimeContext).getSession;
}
