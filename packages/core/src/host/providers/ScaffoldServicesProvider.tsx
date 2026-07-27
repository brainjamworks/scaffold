import { createContext, useContext, useMemo, type ReactNode } from "react";

import type {
  AssessmentPort,
  ScaffoldRuntimePorts,
  LearnerActivityPort,
  XapiPort,
} from "@/host/ports";
import type { MediaPort } from "@/host/ports/media";

export interface ScaffoldServicesProviderProps {
  children?: ReactNode;
  ports: ScaffoldRuntimePorts;
}

const emptyServices: Required<ScaffoldRuntimePorts> = {
  assessment: null,
  learnerActivity: null,
  media: null,
  xapi: null,
};

const ScaffoldServicesContext = createContext<Required<ScaffoldRuntimePorts>>(emptyServices);

export function ScaffoldServicesProvider({ children, ports }: ScaffoldServicesProviderProps) {
  const value = useMemo<Required<ScaffoldRuntimePorts>>(
    () => ({
      assessment: ports.assessment ?? null,
      learnerActivity: ports.learnerActivity ?? null,
      media: ports.media ?? null,
      xapi: ports.xapi ?? null,
    }),
    [ports.assessment, ports.learnerActivity, ports.media, ports.xapi],
  );

  return (
    <ScaffoldServicesContext.Provider value={value}>{children}</ScaffoldServicesContext.Provider>
  );
}

export function useAssessmentPort(): AssessmentPort | null {
  return useContext(ScaffoldServicesContext).assessment;
}

export function useLearnerActivityPort(): LearnerActivityPort | null {
  return useContext(ScaffoldServicesContext).learnerActivity;
}

export function useMediaPort(): MediaPort | null {
  return useContext(ScaffoldServicesContext).media;
}

export function useXapiPort(): XapiPort | null {
  return useContext(ScaffoldServicesContext).xapi;
}
