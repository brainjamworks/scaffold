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

import type { LearningEventPort } from "../../host/ports/learning-events";
import { useScaffoldArtifactIdentity } from "../../host/providers/ScaffoldArtifactIdentityProvider";
import { useLearningEventPort } from "../../host/providers/ScaffoldServicesProvider";

import { createLearningEventSession, type LearningEventSession } from "./session";
import type { BlockLearningEventInput } from "./catalogue";

export type LearningEventSessionAccessor = () => LearningEventSession | null;

export interface LearningEventReporter {
  report(input: BlockLearningEventInput): void;
}

export interface LearningEventRuntimeProviderProps {
  readonly children?: ReactNode;
  readonly contentTitle?: string | null;
}

interface LearningEventRuntimeScope {
  readonly artifactId: string;
  readonly port: LearningEventPort;
  readonly session: LearningEventSession | null;
  readonly reporter: LearningEventReporter;
}

interface RequestedLearningEventRuntimeScope {
  readonly artifactId: string | null;
  readonly port: LearningEventPort | null;
  readonly contentTitle: string | null | undefined;
}

interface RetiringLearningEventRuntimeScope {
  readonly scope: LearningEventRuntimeScope;
  readonly termination: Promise<void>;
}

interface LearningEventRuntimeContextValue {
  readonly session: LearningEventSession | null;
  readonly getSession: LearningEventSessionAccessor;
  readonly reporter: LearningEventReporter;
}

const noSession: LearningEventSessionAccessor = () => null;
const noOpReporter = Object.freeze<LearningEventReporter>({ report: () => undefined });
const unavailableContext = Object.freeze<LearningEventRuntimeContextValue>({
  session: null,
  getSession: noSession,
  reporter: noOpReporter,
});
const LearningEventRuntimeContext =
  createContext<LearningEventRuntimeContextValue>(unavailableContext);

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

function createLearningEventRuntimeScope(
  artifactId: string | null,
  port: LearningEventPort | null,
  contentTitle: string | null | undefined,
): LearningEventRuntimeScope | null {
  if (!artifactId || !port) return null;

  let session: LearningEventSession | null = null;
  try {
    session = createLearningEventSession({
      port,
      contentTitle: contentTitle ?? "",
      createUuid,
      now: () => new Date(),
      monotonicNow: () => globalThis.performance.now(),
    });
  } catch {
    // Invalid host Learning Event configuration makes reporting unavailable, not learning unavailable.
  }

  return {
    artifactId,
    port,
    session,
    reporter:
      session === null
        ? noOpReporter
        : Object.freeze({
            report: (input: BlockLearningEventInput) => session?.recordBlock(input),
          }),
  };
}

function scopeMatchesRequest(
  scope: LearningEventRuntimeScope | null,
  artifactId: string | null,
  port: LearningEventPort | null,
): boolean {
  return scope
    ? scope.artifactId === artifactId && scope.port === port
    : artifactId === null || port === null;
}

export function LearningEventRuntimeProvider({
  children,
  contentTitle,
}: LearningEventRuntimeProviderProps): ReactNode {
  const { artifactId } = useScaffoldArtifactIdentity();
  const port = useLearningEventPort();
  const requestedScopeRef = useRef<RequestedLearningEventRuntimeScope>({
    artifactId,
    port,
    contentTitle,
  });
  requestedScopeRef.current = { artifactId, port, contentTitle };
  const [activeScope, setActiveScope] = useState<LearningEventRuntimeScope | null>(() =>
    createLearningEventRuntimeScope(artifactId, port, contentTitle),
  );
  const activeScopeRef = useRef(activeScope);
  const retiringScopeRef = useRef<RetiringLearningEventRuntimeScope | null>(null);
  const transitionGenerationRef = useRef(0);
  const providerGenerationRef = useRef(0);
  const currentScope = scopeMatchesRequest(activeScope, artifactId, port) ? activeScope : null;

  const currentSession = currentScope?.session ?? null;
  const sessionRef = useRef<LearningEventSession | null>(currentSession);
  const getSession = useCallback<LearningEventSessionAccessor>(() => sessionRef.current, []);

  useLayoutEffect(() => {
    sessionRef.current = currentSession;
  }, [currentSession]);

  useEffect(() => {
    const generation = transitionGenerationRef.current + 1;
    transitionGenerationRef.current = generation;
    let cancelled = false;

    const transition = async () => {
      const requestedScope = requestedScopeRef.current;
      const active = activeScopeRef.current;
      let retirement = retiringScopeRef.current;

      if (
        active !== null &&
        !scopeMatchesRequest(active, requestedScope.artifactId, requestedScope.port)
      ) {
        activeScopeRef.current = null;
        setActiveScope(null);
        retirement = {
          scope: active,
          termination: active.session?.terminate() ?? Promise.resolve(),
        };
        retiringScopeRef.current = retirement;
      } else if (active !== null) {
        return;
      }

      if (retirement !== null) {
        await retirement.termination;
        if (retiringScopeRef.current === retirement) {
          retiringScopeRef.current = null;
        }
      }

      if (cancelled || transitionGenerationRef.current !== generation) return;
      const latestRequest = requestedScopeRef.current;
      if (latestRequest.artifactId !== artifactId || latestRequest.port !== port) return;

      const nextScope = createLearningEventRuntimeScope(
        latestRequest.artifactId,
        latestRequest.port,
        latestRequest.contentTitle,
      );
      activeScopeRef.current = nextScope;
      setActiveScope(nextScope);
    };

    void transition();
    return () => {
      cancelled = true;
    };
  }, [artifactId, port]);

  useEffect(() => {
    const generation = providerGenerationRef.current + 1;
    providerGenerationRef.current = generation;

    return () => {
      void Promise.resolve().then(() => {
        if (providerGenerationRef.current !== generation) return;
        const active = activeScopeRef.current;
        activeScopeRef.current = null;
        void active?.session?.terminate();
        void retiringScopeRef.current?.scope.session?.terminate();
      });
    };
  }, []);

  const value: LearningEventRuntimeContextValue = {
    session: currentSession,
    getSession,
    reporter: currentScope?.reporter ?? noOpReporter,
  };

  return (
    <LearningEventRuntimeContext.Provider value={value}>
      {children}
    </LearningEventRuntimeContext.Provider>
  );
}

export function useLearningEventSession(): LearningEventSession | null {
  return useContext(LearningEventRuntimeContext).session;
}

export function useLearningEventSessionAccessor(): LearningEventSessionAccessor {
  return useContext(LearningEventRuntimeContext).getSession;
}

export function useLearningEventReporter(): LearningEventReporter {
  return useContext(LearningEventRuntimeContext).reporter;
}
