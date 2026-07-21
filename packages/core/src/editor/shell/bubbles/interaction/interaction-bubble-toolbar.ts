import type { KeyboardEvent } from "react";

export function interactionBubbleRootA11yAttributes() {
  return {
    role: "toolbar",
    "aria-label": "Block actions",
    "aria-orientation": "horizontal",
  } as const;
}

export function handleInteractionBubbleToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
  if (
    event.key !== "ArrowRight" &&
    event.key !== "ArrowLeft" &&
    event.key !== "Home" &&
    event.key !== "End"
  ) {
    return;
  }

  if (!(event.target instanceof HTMLButtonElement)) return;

  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
  );
  if (buttons.length === 0) return;

  const currentIndex = buttons.indexOf(event.target);
  if (currentIndex < 0) return;

  event.preventDefault();

  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : event.key === "ArrowRight"
          ? (currentIndex + 1) % buttons.length
          : (currentIndex + buttons.length - 1) % buttons.length;

  const nextButton = buttons[nextIndex];
  if (!nextButton) return;
  nextButton.focus({ preventScroll: true });
  revealControlWithinHorizontalToolbar(event.currentTarget, nextButton);
}

export function revealControlWithinHorizontalToolbar(
  toolbar: HTMLElement,
  control: HTMLElement,
): void {
  const toolbarRect = toolbar.getBoundingClientRect();
  const controlRect = control.getBoundingClientRect();
  const visibleLeft = toolbarRect.left + toolbar.clientLeft;
  const visibleRight = visibleLeft + toolbar.clientWidth;
  const delta =
    controlRect.left < visibleLeft
      ? controlRect.left - visibleLeft
      : controlRect.right > visibleRight
        ? controlRect.right - visibleRight
        : 0;

  if (delta !== 0) toolbar.scrollLeft += delta;
}
