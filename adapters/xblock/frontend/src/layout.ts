const SCAFFOLD_STUDIO_MODAL_SELECTOR = ".modal-type-scaffold.modal-window.modal-editor";
const SCAFFOLD_HOST_MODAL_CLASS = "sc-xblock-host-modal";
const SCAFFOLD_FULLSCREEN_FALLBACK_CLASS = "sc-xblock-host-modal-fallback";

function findStudioModal(element: Element): HTMLElement | null {
  const direct = element.closest<HTMLElement>(SCAFFOLD_STUDIO_MODAL_SELECTOR);
  if (direct) return direct;

  return document.querySelector<HTMLElement>(SCAFFOLD_STUDIO_MODAL_SELECTOR);
}

export function applyStudioLayoutCompat(
  element: Element,
  { preferFullscreen = true }: { preferFullscreen?: boolean } = {},
): void {
  const modal = findStudioModal(element);
  if (!modal) return;

  modal.classList.add(SCAFFOLD_HOST_MODAL_CLASS);

  if (!preferFullscreen) {
    modal.classList.remove(SCAFFOLD_FULLSCREEN_FALLBACK_CLASS);
    return;
  }

  if (modal.classList.contains("modal-fullscreen")) {
    modal.classList.remove(SCAFFOLD_FULLSCREEN_FALLBACK_CLASS);
    return;
  }

  const fullscreenButton = modal.querySelector<HTMLButtonElement>(".fullscreen-button");

  if (fullscreenButton) {
    fullscreenButton.click();
  }

  if (modal.classList.contains("modal-fullscreen")) {
    modal.classList.remove(SCAFFOLD_FULLSCREEN_FALLBACK_CLASS);
    return;
  }

  modal.classList.add(SCAFFOLD_FULLSCREEN_FALLBACK_CLASS);
}
