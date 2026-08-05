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

import type { XapiPort } from "../../host/ports";
import type { LearningEvent, LearningEventPort } from "../../host/ports/learning-events";
import { useScaffoldArtifactIdentity } from "../../host/providers/ScaffoldArtifactIdentityProvider";
import { useXapiPort } from "../../host/providers/ScaffoldServicesProvider";

import { createLearningEventSession, type LearningEventSession } from "./session";
import type { BlockLearningEventInput } from "./catalogue";

export type LearningEventSessionAccessor = () => LearningEventSession | null;

export interface LearningEventReporter {
  report(input: BlockLearningEventInput): void;
}

export interface LearningEventRuntimeProviderProps {
  readonly children?: ReactNode;
  readonly artefactTitle?: string | null;
}

interface LearningEventRuntimeScope {
  readonly artifactId: string;
  readonly sourcePort: XapiPort;
  readonly port: LearningEventPort;
  readonly session: LearningEventSession | null;
  readonly reporter: LearningEventReporter;
  cleanupGeneration: number;
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
  port: XapiPort | null,
  artefactTitle: string | null | undefined,
): LearningEventRuntimeScope | null {
  if (!artifactId || !port) return null;

  const learningEventPort: LearningEventPort = Object.freeze({
    rootActivityId: port.activityId,
    accept: (event: LearningEvent) => port.send(event),
  });

  let session: LearningEventSession | null = null;
  try {
    session = createLearningEventSession({
      port: learningEventPort,
      artefactTitle: artefactTitle ?? "",
      createUuid,
      now: () => new Date(),
      monotonicNow: () => globalThis.performance.now(),
    });
  } catch {
    // Invalid host xAPI configuration makes recording unavailable, not learning unavailable.
  }

  return {
    artifactId,
    sourcePort: port,
    port: learningEventPort,
    session,
    reporter:
      session === null
        ? noOpReporter
        : Object.freeze({
            report: (input: BlockLearningEventInput) => session?.recordBlock(input),
          }),
    cleanupGeneration: 0,
  };
}

export function LearningEventRuntimeProvider({
  children,
  artefactTitle,
}: LearningEventRuntimeProviderProps): ReactNode {
  const { artifactId } = useScaffoldArtifactIdentity();
  const port = useXapiPort();
  const [scope, setScope] = useState<LearningEventRuntimeScope | null>(() =>
    createLearningEventRuntimeScope(artifactId, port, artefactTitle),
  );
  let currentScope = scope;
  const scopeMatches = currentScope
    ? currentScope.artifactId === artifactId && currentScope.sourcePort === port
    : artifactId === null || port === null;

  if (!scopeMatches) {
    currentScope = createLearningEventRuntimeScope(artifactId, port, artefactTitle);
    setScope(currentScope);
  }

  const currentSession = currentScope?.session ?? null;
  const sessionRef = useRef<LearningEventSession | null>(currentSession);
  const getSession = useCallback<LearningEventSessionAccessor>(() => sessionRef.current, []);

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
