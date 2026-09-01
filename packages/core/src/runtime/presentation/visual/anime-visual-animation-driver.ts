import { animate as animeAnimate } from "animejs";
import { createLayout as animeCreateLayout } from "animejs/layout";

import type {
  VisualAnimationDriver,
  VisualAnimationHandle,
  VisualAnimationInput,
  VisualKeyframe,
} from "./visual-animation-driver";

interface AnimeAnimationHandle {
  seek(timeMs: number, muteCallbacks?: boolean): unknown;
  cancel(): unknown;
}

interface AnimeLayoutTimeline {
  seek(timeMs: number, muteCallbacks?: boolean): unknown;
  cancel(): unknown;
  complete(muteCallbacks?: boolean): unknown;
}

interface AnimeLayout {
  record(): unknown;
  animate(parameters: Readonly<Record<string, unknown>>): AnimeLayoutTimeline;
  revert(): unknown;
}

type AnimeCreateLayout = (
  root: HTMLElement,
  parameters?: Readonly<Record<string, unknown>>,
) => AnimeLayout;

export interface PresentationLayoutAnimationInput {
  readonly root: HTMLElement;
  readonly durationMs: number;
  readonly easing: string;
  readonly applyLayout: () => void;
}

export interface PresentationLayoutAnimationHandle {
  apply(localTimeMs: number): void;
  cancel(): void;
  finish(): void;
  dispose(): void;
}

export type PresentationLayoutAnimationFactory = (
  input: PresentationLayoutAnimationInput,
) => PresentationLayoutAnimationHandle;

type AnimeAnimate = (
  element: HTMLElement,
  parameters: Readonly<Record<string, unknown>>,
) => AnimeAnimationHandle;

export function createAnimeVisualAnimationDriver({
  animate = animeAnimate as unknown as AnimeAnimate,
}: {
  readonly animate?: AnimeAnimate;
} = {}): VisualAnimationDriver {
  return Object.freeze({
    create(input: VisualAnimationInput): VisualAnimationHandle {
      assertAnimationInput(input);
      const animation = animate(input.element, {
        autoplay: false,
        duration: input.durationMs,
        ease: input.easing,
        keyframes: Object.fromEntries(
          input.keyframes.map((keyframe) => [
            String(keyframe.offset * 100),
            toAnimeKeyframe(keyframe),
          ]),
        ),
      });
      let cancelled = false;

      return Object.freeze({
        seek(localTimeMs: number): void {
          if (cancelled) {
            throw new Error(`Presentation animation "${input.segmentId}" has been cancelled.`);
          }
          if (!Number.isFinite(localTimeMs) || localTimeMs < 0 || localTimeMs > input.durationMs) {
            throw new Error(
              `Presentation animation "${input.segmentId}" received an invalid seek time.`,
            );
          }
          animation.seek(localTimeMs, true);
        },
        cancel(): void {
          if (cancelled) return;
          cancelled = true;
          animation.cancel();
        },
      });
    },
  });
}

export function createAnimePresentationLayoutAnimation(
  input: PresentationLayoutAnimationInput,
  {
    createLayout = animeCreateLayout as unknown as AnimeCreateLayout,
  }: { readonly createLayout?: AnimeCreateLayout } = {},
): PresentationLayoutAnimationHandle {
  if (!(input.root instanceof HTMLElement)) {
    throw new Error("Presentation Layout animation requires one HTMLElement root.");
  }
  if (!Number.isSafeInteger(input.durationMs) || input.durationMs <= 0) {
    throw new Error("Presentation Layout animation duration must be a positive safe integer.");
  }
  const layout = createLayout(input.root, { children: "*" });
  layout.record();
  try {
    input.applyLayout();
  } catch (error) {
    layout.revert();
    throw error;
  }
  const timeline = layout.animate({
    autoplay: false,
    duration: input.durationMs,
    ease: input.easing,
  });
  let cancelled = false;
  let finished = false;
  let disposed = false;

  return Object.freeze({
    apply(localTimeMs: number): void {
      assertLayoutHandleActive(disposed, "apply");
      if (
        !Number.isFinite(localTimeMs) ||
        localTimeMs < 0 ||
        localTimeMs > input.durationMs
      ) {
        throw new Error("Presentation Layout animation received an invalid seek time.");
      }
      timeline.seek(localTimeMs, true);
    },
    cancel(): void {
      if (disposed || cancelled || finished) return;
      cancelled = true;
      timeline.cancel();
    },
    finish(): void {
      if (disposed || cancelled || finished) return;
      finished = true;
      timeline.complete(true);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (!cancelled && !finished) timeline.cancel();
      layout.revert();
    },
  });
}

function assertLayoutHandleActive(disposed: boolean, operation: string): void {
  if (disposed) throw new Error(`Cannot ${operation} a disposed Presentation Layout animation.`);
}

function assertAnimationInput(input: VisualAnimationInput): void {
  if (!Number.isSafeInteger(input.durationMs) || input.durationMs <= 0) {
    throw new Error("Presentation animation duration must be a positive safe integer.");
  }
  if (!(input.element instanceof HTMLElement)) {
    throw new Error("Presentation animation requires one HTMLElement reference.");
  }
  if (input.keyframes.length < 2) {
    throw new Error("Presentation animation requires at least two keyframes.");
  }
  let priorOffset = -1;
  for (const [index, keyframe] of input.keyframes.entries()) {
    if (
      !Number.isFinite(keyframe.offset) ||
      keyframe.offset < 0 ||
      keyframe.offset > 1 ||
      (index > 0 && keyframe.offset <= priorOffset) ||
      (index === 0 && keyframe.offset !== 0) ||
      (index === input.keyframes.length - 1 && keyframe.offset !== 1)
    ) {
      throw new Error("Presentation animation keyframe offsets must be ordered from 0 to 1.");
    }
    if (
      keyframe.opacity !== undefined &&
      (!Number.isFinite(keyframe.opacity) || keyframe.opacity < 0 || keyframe.opacity > 1)
    ) {
      throw new Error("Presentation animation opacity must be finite and between 0 and 1.");
    }
    priorOffset = keyframe.offset;
  }
}

function toAnimeKeyframe(keyframe: VisualKeyframe): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...(keyframe.opacity === undefined ? {} : { opacity: keyframe.opacity }),
    ...(keyframe.transform === undefined
      ? {}
      : { transform: resolveTransform(keyframe.transform) }),
    ...(keyframe.clip === undefined ? {} : { clipPath: `inset(${keyframe.clip.inset})` }),
  });
}

function resolveTransform(transform: NonNullable<VisualKeyframe["transform"]>): string {
  return [
    transform.translateX === undefined ? null : `translateX(${transform.translateX}px)`,
    transform.translateY === undefined ? null : `translateY(${transform.translateY}px)`,
    transform.scale === undefined ? null : `scale(${transform.scale})`,
    transform.rotateDeg === undefined ? null : `rotate(${transform.rotateDeg}deg)`,
  ]
    .filter((value): value is string => value !== null)
    .join(" ");
}
