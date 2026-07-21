import type { MouseEvent } from "react";

export function preserveRichTextSelection(event: MouseEvent<HTMLElement>) {
  event.preventDefault();
}

export function preserveRichTextSelectionWithinCurrentTarget(event: MouseEvent<HTMLElement>) {
  if (!(event.target instanceof Node)) return;
  if (!event.currentTarget.contains(event.target)) return;
  preserveRichTextSelection(event);
}

export function preventPopoverAutoFocus(event: Event) {
  event.preventDefault();
}
