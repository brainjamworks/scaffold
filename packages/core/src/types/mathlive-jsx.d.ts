import type { MathfieldElement } from "mathlive";
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": DetailedHTMLProps<HTMLAttributes<MathfieldElement>, MathfieldElement> & {
        class?: string;
        value?: string;
        "math-virtual-keyboard-policy"?: "auto" | "manual" | "sandboxed";
      };
    }
  }
}
