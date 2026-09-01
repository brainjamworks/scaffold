import type { EmbeddedDataId } from "@scaffold/contracts";

export type ResolvedPresentationEasing = string;

export interface VisualTransform {
  readonly translateX?: number;
  readonly translateY?: number;
  readonly scale?: number;
  readonly rotateDeg?: number;
}

export interface ResolvedVisualClip {
  readonly inset: string;
}

export interface VisualKeyframe {
  readonly offset: number;
  readonly opacity?: number;
  readonly transform?: VisualTransform;
  readonly clip?: ResolvedVisualClip;
}

export interface VisualAnimationInput {
  readonly segmentId: EmbeddedDataId;
  readonly element: HTMLElement;
  readonly durationMs: number;
  readonly easing: ResolvedPresentationEasing;
  readonly keyframes: readonly [VisualKeyframe, ...VisualKeyframe[]];
}

export interface VisualAnimationHandle {
  seek(localTimeMs: number): void;
  cancel(): void;
}

export interface VisualAnimationDriver {
  create(input: VisualAnimationInput): VisualAnimationHandle;
}
