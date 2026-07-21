import type { ReactNodeViewProps } from "@tiptap/react";
import "mathlive/static.css";
import "mathlive";
import type { MathfieldElement } from "mathlive";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type {} from "@/types/mathlive-jsx";

import { cleanMathLiveLatex, hideMathVirtualKeyboard } from "./math-live";
import "./math-inline.css";

export function MathInlineEditor({
  latex,
  nodeViewProps,
  onExit,
  onFocusChange,
}: {
  latex: string;
  nodeViewProps: ReactNodeViewProps;
  onExit: () => void;
  onFocusChange: (focused: boolean) => void;
}) {
  const mathfieldRef = useRef<MathfieldElement | null>(null);

  useEffect(() => {
    const mathfield = mathfieldRef.current;
    if (!mathfield) return;

    if (mathfield.value !== latex) {
      mathfield.value = latex;
    }

    const focusTimer = window.setTimeout(() => {
      mathfield.focus();
      window.mathVirtualKeyboard?.show();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [latex]);

  useEffect(() => {
    return () => {
      hideMathVirtualKeyboard();
    };
  }, []);

  const updateLatex = () => {
    const mathfield = mathfieldRef.current;
    if (!mathfield) return;

    const nextLatex = cleanMathLiveLatex(mathfield.getValue("latex"));
    nodeViewProps.updateAttributes({ latex: nextLatex });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<MathfieldElement>) => {
    if (event.key !== "Escape" && event.key !== "Enter") return;

    event.preventDefault();
    hideMathVirtualKeyboard();
    onFocusChange(false);
    onExit();
  };

  return (
    <math-field
      ref={mathfieldRef}
      aria-label="Inline math"
      data-scaffold-math-field
      math-virtual-keyboard-policy="manual"
      onFocus={() => onFocusChange(true)}
      onBlur={() => {
        updateLatex();
        onFocusChange(false);
        window.setTimeout(hideMathVirtualKeyboard, 0);
      }}
      onInput={updateLatex}
      onKeyDown={handleKeyDown}
      class="sc-inline-math-editor"
    />
  );
}
