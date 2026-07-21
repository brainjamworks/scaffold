import type { Editor } from "@tiptap/core";
import { useEffect } from "react";

export function useBubbleMenuScrollPositionSync(editor: Editor, pluginKey: string): void {
  useEffect(() => {
    if (editor.isDestroyed) return;

    const ownerDocument = editor.view.dom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    let animationFrame: number | null = null;

    const updatePosition = () => {
      animationFrame = null;
      if (editor.isDestroyed) return;

      editor.view.dispatch(editor.state.tr.setMeta(pluginKey, "updatePosition"));
    };

    const schedulePositionUpdate = (event: Event) => {
      if (!isRelevantScrollTarget(editor.view.dom, event.target)) return;
      if (animationFrame !== null) return;

      animationFrame = ownerWindow?.requestAnimationFrame(updatePosition) ?? null;
      if (animationFrame === null) updatePosition();
    };

    ownerDocument.addEventListener("scroll", schedulePositionUpdate, true);
    ownerWindow?.addEventListener("scroll", schedulePositionUpdate, true);

    return () => {
      ownerDocument.removeEventListener("scroll", schedulePositionUpdate, true);
      ownerWindow?.removeEventListener("scroll", schedulePositionUpdate, true);

      if (animationFrame !== null) {
        ownerWindow?.cancelAnimationFrame(animationFrame);
      }
    };
  }, [editor, pluginKey]);
}

function isRelevantScrollTarget(editorElement: HTMLElement, target: EventTarget | null): boolean {
  if (!target) return true;
  if (target === editorElement.ownerDocument) return true;
  if (target === editorElement.ownerDocument.defaultView) return true;
  if (!(target instanceof Element)) return false;

  return editorElement.contains(target) || target.contains(editorElement);
}
