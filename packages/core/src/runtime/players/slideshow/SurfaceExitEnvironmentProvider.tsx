import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { SurfaceExitEnvironment } from "./surface-exit-environment";

export type SurfaceExitEnvironmentAvailability =
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "available"; environment: SurfaceExitEnvironment }>;

const unavailableEnvironment = Object.freeze({ status: "unavailable" } as const);
const SurfaceExitEnvironmentContext =
  createContext<SurfaceExitEnvironmentAvailability>(unavailableEnvironment);

export function SurfaceExitEnvironmentProvider({
  children,
  environment,
}: {
  readonly children?: ReactNode;
  readonly environment: SurfaceExitEnvironment;
}) {
  const availability = useMemo<SurfaceExitEnvironmentAvailability>(
    () => Object.freeze({ status: "available", environment }),
    [environment],
  );

  return (
    <SurfaceExitEnvironmentContext.Provider value={availability}>
      {children}
    </SurfaceExitEnvironmentContext.Provider>
  );
}

export function useSurfaceExitEnvironmentAvailability(): SurfaceExitEnvironmentAvailability {
  return useContext(SurfaceExitEnvironmentContext);
}
