import { animate as animeAnimate } from "animejs";

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
            toAnimeKeyframe(keyframe, input.baseTransform),
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

function toAnimeKeyframe(
  keyframe: VisualKeyframe,
  baseTransform: string | undefined,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...(keyframe.opacity === undefined ? {} : { opacity: keyframe.opacity }),
    ...(keyframe.transform === undefined
      ? {}
      : { transform: composeTransforms(baseTransform, resolveTransform(keyframe.transform)) }),
    ...(keyframe.clip === undefined ? {} : { clipPath: `inset(${keyframe.clip.inset})` }),
  });
}

function composeTransforms(...transforms: readonly (string | undefined)[]): string {
  return transforms
    .filter((transform): transform is string => Boolean(transform && transform !== "none"))
    .join(" ");
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
