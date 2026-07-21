import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { EditorRailViewport } from "./EditorRailViewport";
import "./editor-shell.css";

export type EditorShellScrollModel = "page" | "contained";

export interface EditorShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Primary work surface — the document editor or any future stage mode. */
  stage: ReactNode;
  /**
   * Optional vertical left-rail tool surface (rich-text formatting pill,
   * etc.). Vertically centered in the viewport.
   */
  leftRail?: ReactNode;
  /** Reserve the left-rail column before its content is ready. */
  reserveLeftRail?: boolean;
  /**
   * Optional vertical right-rail tool surface (block insert pill, etc.).
   * Vertically centered in the viewport. Sits between the stage and the
   * dock when both are present.
   */
  rightRail?: ReactNode;
  /** Reserve the right-rail column before its content is ready. */
  reserveRightRail?: boolean;
  /** Optional right-side dock surface — agent panel, review, outline. */
  dock?: ReactNode;
  /**
   * How the editor content scrolls.
   *
   * `page`: the document/window scrolls, so rails sit below the sticky
   * app header.
   * `contained`: the editor body owns the scrollport below the app header,
   * so rails stick to the top of that scrollport.
   */
  scrollModel?: EditorShellScrollModel;
}

/**
 * Layout container for the editor's content row. Owns the canvas
 * background, the gap between Stage and Dock, and the responsive
 * stacking behaviour. Each slot keeps control of its landmark element
 * (`section` vs `aside` vs `div`) and applies its own named surface class.
 *
 * Document mode (page / slideshow / branching) lives inside the Stage
 * slot — the shell is mode-agnostic.
 *
 * Column order (left → right): leftRail · stage · rightRail · dock.
 * Rails live inside reserved shell columns so their horizontal position is
 * always measured in the same coordinate system as the stage and dock. They
 * use sticky vertical positioning to stay centered while the editor scrolls.
 */
export function EditorShell({
  stage,
  leftRail,
  reserveLeftRail = false,
  rightRail,
  reserveRightRail = false,
  dock,
  scrollModel = "page",
  className,
  ...rest
}: EditorShellProps) {
  return (
    <div className={cn("sc-editor-shell", className)} data-scroll-model={scrollModel} {...rest}>
      {leftRail || reserveLeftRail ? (
        <div className="sc-editor-rail-slot" data-side="left">
          {leftRail ? (
            <div className="sc-editor-rail" data-side="left">
              <EditorRailViewport side="left">{leftRail}</EditorRailViewport>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="sc-editor-stage">{stage}</div>
      {rightRail || reserveRightRail ? (
        <div className="sc-editor-rail-slot" data-side="right">
          {rightRail ? (
            <div className="sc-editor-rail" data-side="right">
              <EditorRailViewport side="right">{rightRail}</EditorRailViewport>
            </div>
          ) : null}
        </div>
      ) : null}
      {dock ? <div className="sc-editor-dock-slot">{dock}</div> : null}
    </div>
  );
}
