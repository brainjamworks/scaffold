export function cleanMathLiveLatex(raw: string): string {
  return raw
    .replace(/\\placeholder\{[^}]*\}/g, "")
    .replace(/\\exponentialE/g, "e")
    .replace(/\\imaginaryI/g, "i")
    .replace(/\\differentialD/g, "d")
    .trim();
}

export function cleanupMathLiveFloatingUi() {
  if (typeof document === "undefined") return;

  document.querySelectorAll<HTMLElement>('body > div[role="presentation"]').forEach((element) => {
    if (element.querySelector(".MLK__variant-panel")) {
      element.remove();
    }
  });

  document
    .querySelectorAll<HTMLElement>(".MLK__variant-panel")
    .forEach((element) => element.remove());

  if (!document.querySelector("math-field")) {
    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("margin-right");
  }
}

export function hideMathVirtualKeyboard() {
  if (typeof window === "undefined") return;
  window.mathVirtualKeyboard?.hide();
  cleanupMathLiveFloatingUi();
  window.setTimeout(cleanupMathLiveFloatingUi, 0);
}
