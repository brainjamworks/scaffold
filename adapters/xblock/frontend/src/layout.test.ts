// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { applyStudioLayoutCompat } from "./layout";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function renderModal({
  fullscreenButton = false,
  alreadyFullscreen = false,
}: {
  fullscreenButton?: boolean;
  alreadyFullscreen?: boolean;
} = {}): HTMLElement {
  document.body.innerHTML = `
    <div class="modal-type-scaffold modal-window modal-editor${alreadyFullscreen ? " modal-fullscreen" : ""}">
      <div class="modal-content">
        ${fullscreenButton ? '<button type="button" class="fullscreen-button">Fullscreen</button>' : ""}
        <div class="xblock-studio_view">
          <div class="scaffold-xblock scaffold-studio"></div>
        </div>
      </div>
    </div>
  `;

  const mount = document.querySelector<HTMLElement>(".scaffold-xblock");
  if (!mount) throw new Error("Missing test mount.");
  return mount;
}

describe("applyStudioLayoutCompat", () => {
  it("applies the scoped fullscreen fallback when released Teak has no native button", () => {
    const mount = renderModal();

    applyStudioLayoutCompat(mount);

    const modal = document.querySelector<HTMLElement>(".modal-type-scaffold");
    expect(modal?.classList.contains("sc-xblock-host-modal")).toBe(true);
    expect(modal?.classList.contains("sc-xblock-host-modal-fallback")).toBe(true);
  });

  it("uses native Open edX fullscreen when the button is available", () => {
    const mount = renderModal({ fullscreenButton: true });
    const button = document.querySelector<HTMLButtonElement>(".fullscreen-button");
    const clickSpy = vi.spyOn(button as HTMLButtonElement, "click");
    button?.addEventListener("click", () => {
      button.closest(".modal-type-scaffold")?.classList.add("modal-fullscreen");
    });

    applyStudioLayoutCompat(mount);

    const modal = document.querySelector<HTMLElement>(".modal-type-scaffold");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(modal?.classList.contains("sc-xblock-host-modal")).toBe(true);
    expect(modal?.classList.contains("modal-fullscreen")).toBe(true);
    expect(modal?.classList.contains("sc-xblock-host-modal-fallback")).toBe(false);
  });

  it("does not apply the fallback when the modal is already fullscreen", () => {
    const mount = renderModal({
      fullscreenButton: true,
      alreadyFullscreen: true,
    });
    const button = document.querySelector<HTMLButtonElement>(".fullscreen-button");
    const clickSpy = vi.spyOn(button as HTMLButtonElement, "click");

    applyStudioLayoutCompat(mount);

    const modal = document.querySelector<HTMLElement>(".modal-type-scaffold");
    expect(clickSpy).not.toHaveBeenCalled();
    expect(modal?.classList.contains("sc-xblock-host-modal")).toBe(true);
    expect(modal?.classList.contains("sc-xblock-host-modal-fallback")).toBe(false);
  });

  it("does nothing outside an Open edX Studio modal", () => {
    const mount = document.createElement("div");
    document.body.append(mount);

    expect(() => applyStudioLayoutCompat(mount)).not.toThrow();
    expect(document.querySelector(".sc-xblock-host-modal")).toBeNull();
  });
});
