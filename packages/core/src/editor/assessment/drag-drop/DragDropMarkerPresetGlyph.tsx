import {
  CheckIcon as Check,
  CircleIcon as Circle,
  CrosshairIcon as Crosshair,
  FlagIcon as Flag,
  XIcon as X,
} from "@phosphor-icons/react";
import type { MarkerPresetId } from "@scaffold/contracts";

export function DragDropMarkerPresetGlyph({ preset }: { readonly preset: MarkerPresetId }) {
  switch (preset) {
    case "cross":
      return <X size="1em" weight="bold" aria-hidden />;
    case "pin":
      return <Crosshair size="1em" weight="bold" aria-hidden />;
    case "dot":
      return <Circle size="1em" weight="fill" aria-hidden />;
    case "flag":
      return <Flag size="1em" weight="fill" aria-hidden />;
    case "check":
      return <Check size="1em" weight="bold" aria-hidden />;
  }
}
