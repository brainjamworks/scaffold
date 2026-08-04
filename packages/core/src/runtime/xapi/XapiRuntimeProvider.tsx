/** @deprecated Migration-only provider façade over one Learning Event context. */
import { useCallback, type ReactNode } from "react";

import {
  LearningEventRuntimeProvider,
  useLearningEventSession,
  useLearningEventSessionAccessor,
} from "../learning-events/LearningEventRuntimeProvider";
import { adaptLearningEventSessionForXapiMigration, type XapiSession } from "./session";

export type XapiSessionAccessor = () => XapiSession | null;

export interface XapiRuntimeProviderProps {
  readonly children?: ReactNode;
  readonly courseTitle?: string | null;
}

export function XapiRuntimeProvider({
  children,
  courseTitle,
}: XapiRuntimeProviderProps): ReactNode {
  return (
    <LearningEventRuntimeProvider
      {...(courseTitle === undefined ? {} : { artefactTitle: courseTitle })}
    >
      {children}
    </LearningEventRuntimeProvider>
  );
}

export function useXapiSession(): XapiSession | null {
  return adaptLearningEventSessionForXapiMigration(useLearningEventSession());
}

export function useXapiSessionAccessor(): XapiSessionAccessor {
  const getLearningEventSession = useLearningEventSessionAccessor();
  return useCallback(
    () => adaptLearningEventSessionForXapiMigration(getLearningEventSession()),
    [getLearningEventSession],
  );
}
