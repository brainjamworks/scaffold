import type { Editor, ResizableNodeDimensions } from "@tiptap/core";

import {
  isEditorResizeGestureActive,
  setEditorResizeGestureActive,
} from "@/editor/interactions/gesture/editor-resize-gesture";

export interface ResizeGestureSessionOptions {
  editor: Editor;
  onCancel: () => void;
}

export class ResizeGestureSession {
  private cancelInterruptionCleanup: (() => void) | null = null;
  private currentLiveSize: ResizableNodeDimensions | null = null;

  constructor(private readonly options: ResizeGestureSessionOptions) {}

  get liveSize(): ResizableNodeDimensions | null {
    return this.currentLiveSize;
  }

  get active(): boolean {
    return Boolean(this.currentLiveSize) || isEditorResizeGestureActive(this.options.editor);
  }

  preview(size: ResizableNodeDimensions): void {
    this.currentLiveSize = size;
    setEditorResizeGestureActive(this.options.editor, true);
    this.ensureInterruptionCleanup();
  }

  clear(): void {
    this.currentLiveSize = null;
    this.removeInterruptionCleanup();
    setEditorResizeGestureActive(this.options.editor, false);
  }

  destroy(): void {
    this.clear();
  }

  private cancelActiveGesture = (): void => {
    if (!this.active) return;

    this.clear();
    this.options.onCancel();
  };

  private ensureInterruptionCleanup(): void {
    if (this.cancelInterruptionCleanup) return;

    const ownerDocument = this.options.editor.view.dom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    const handleVisibilityChange = () => {
      if (ownerDocument.visibilityState === "hidden") {
        this.cancelActiveGesture();
      }
    };

    ownerDocument.addEventListener("mouseup", this.cancelActiveGesture);
    ownerDocument.addEventListener("touchend", this.cancelActiveGesture);
    ownerDocument.addEventListener("touchcancel", this.cancelActiveGesture);
    ownerDocument.addEventListener("visibilitychange", handleVisibilityChange);
    ownerWindow?.addEventListener("blur", this.cancelActiveGesture);

    this.cancelInterruptionCleanup = () => {
      ownerDocument.removeEventListener("mouseup", this.cancelActiveGesture);
      ownerDocument.removeEventListener("touchend", this.cancelActiveGesture);
      ownerDocument.removeEventListener("touchcancel", this.cancelActiveGesture);
      ownerDocument.removeEventListener("visibilitychange", handleVisibilityChange);
      ownerWindow?.removeEventListener("blur", this.cancelActiveGesture);
    };
  }

  private removeInterruptionCleanup(): void {
    this.cancelInterruptionCleanup?.();
    this.cancelInterruptionCleanup = null;
  }
}
