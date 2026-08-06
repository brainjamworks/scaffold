import { useEffect, useState } from "react";

const runtimeDragDropAnimation = {
  duration: 160,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

/** Neutral runtime motion preference shared by owner-rendered assessment DnD surfaces. */
export function useAssessmentDndReducedMotion(): boolean {
  const getPreference = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [reducedMotion, setReducedMotion] = useState(getPreference);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

export function assessmentDndDropAnimationFor(reducedMotion: boolean) {
  return reducedMotion ? null : runtimeDragDropAnimation;
}
