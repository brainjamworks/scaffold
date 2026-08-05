import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";

import type { CoordinateSpaceSnapshot } from "../model/coordinate-space";
import {
  STANDARD_PRESENTATION_SCALE_FLOOR,
  resolveInteractionTargetSize,
} from "../model/interaction-target-size";
import { useInteractionDragEnvironmentResolution } from "./interaction-drag-environment";

export interface InteractionDragActivationAreaProps extends HTMLAttributes<HTMLDivElement> {
  readonly safeLocalHeight: number;
  readonly safeLocalWidth: number;
}

type ActivationAreaStyle = CSSProperties & {
  "--sc-interaction-drag-target-min-height"?: string;
  "--sc-interaction-drag-target-min-width"?: string;
};

export function InteractionDragActivationArea({
  children,
  className,
  safeLocalHeight,
  safeLocalWidth,
  style,
  ...props
}: InteractionDragActivationAreaProps) {
  const resolution = useInteractionDragEnvironmentResolution();
  const environment = resolution.status === "ready" ? resolution.environment : null;
  const [snapshot, setSnapshot] = useState<CoordinateSpaceSnapshot | null>(
    () => environment?.coordinateSpace.measure() ?? null,
  );

  useLayoutEffect(() => {
    if (!environment) {
      setSnapshot(null);
      return;
    }
    const update = () => setSnapshot(environment.coordinateSpace.measure());
    update();
    return environment.coordinateSpace.subscribe(update);
  }, [environment]);

  const targetSize = snapshot
    ? resolveInteractionTargetSize({
        scaleX: snapshot.scaleX,
        scaleY: snapshot.scaleY,
        safeLocalWidth,
        safeLocalHeight,
      })
    : null;

  useEffect(() => {
    if (!import.meta.env.DEV || !snapshot || !targetSize) return;
    const missesStandardGuarantee =
      (snapshot.scaleX >= STANDARD_PRESENTATION_SCALE_FLOOR &&
        !targetSize.guaranteesPreferredClientWidth) ||
      (snapshot.scaleY >= STANDARD_PRESENTATION_SCALE_FLOOR &&
        !targetSize.guaranteesPreferredClientHeight);
    if (missesStandardGuarantee) {
      console.error("Interaction drag activation bounds cannot provide the preferred target size.");
    }
  }, [snapshot, targetSize]);

  const activationStyle: ActivationAreaStyle = targetSize
    ? {
        ...style,
        "--sc-interaction-drag-target-min-height": `${targetSize.minimumLocalHeight}px`,
        "--sc-interaction-drag-target-min-width": `${targetSize.minimumLocalWidth}px`,
      }
    : { ...style, pointerEvents: "none" };

  return (
    <div
      {...props}
      data-interaction-drag-activation-area=""
      data-interaction-drag-activation-valid={String(targetSize !== null)}
      data-interaction-drag-preferred-height={String(
        targetSize?.guaranteesPreferredClientHeight ?? false,
      )}
      data-interaction-drag-preferred-width={String(
        targetSize?.guaranteesPreferredClientWidth ?? false,
      )}
      className={["sc-interaction-drag-activation-area", className].filter(Boolean).join(" ")}
      style={activationStyle}
    >
      {children}
    </div>
  );
}
