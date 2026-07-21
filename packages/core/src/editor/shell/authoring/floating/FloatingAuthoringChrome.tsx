import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";

import {
  AUTHORING_EDITOR_FLOATING_LAYER_KIND,
  EditorFloatingLayer,
} from "@/editor/interactions/floating/EditorFloatingLayer";
import { FloatingControlView } from "./FloatingControlView";
import type { FloatingControl } from "./floating-control";
import "./floating-authoring.css";

interface FloatingAuthoringChromeProps {
  controls: readonly FloatingControl[];
  editor: Editor;
}

export function FloatingAuthoringChrome({ controls, editor }: FloatingAuthoringChromeProps) {
  const [, setRenderSignal] = useState(0);

  useEffect(() => {
    const syncRenderSignal = () => setRenderSignal((value) => value + 1);
    const syncRenderSignalAfterFocus = () => {
      editor.view.dom.ownerDocument.defaultView?.setTimeout(syncRenderSignal, 0);
    };
    const ownerDocument = editor.view.dom.ownerDocument;

    editor.on("transaction", syncRenderSignal);
    editor.on("selectionUpdate", syncRenderSignal);
    editor.on("focus", syncRenderSignal);
    editor.on("blur", syncRenderSignalAfterFocus);
    ownerDocument.addEventListener("focusin", syncRenderSignal, true);
    ownerDocument.addEventListener("focusout", syncRenderSignalAfterFocus, true);

    return () => {
      editor.off("transaction", syncRenderSignal);
      editor.off("selectionUpdate", syncRenderSignal);
      editor.off("focus", syncRenderSignal);
      editor.off("blur", syncRenderSignalAfterFocus);
      ownerDocument.removeEventListener("focusin", syncRenderSignal, true);
      ownerDocument.removeEventListener("focusout", syncRenderSignalAfterFocus, true);
    };
  }, [editor]);

  return (
    <EditorFloatingLayer
      className="sc-floating-authoring-layer"
      editor={editor}
      kind={AUTHORING_EDITOR_FLOATING_LAYER_KIND}
    >
      {controls.map((control) => (
        <FloatingControlView key={control.label} control={control} editor={editor} />
      ))}
    </EditorFloatingLayer>
  );
}
