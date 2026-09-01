import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";

import { cn } from "@/lib/cn";

import { EditorRailViewport } from "./EditorRailViewport";
import "./editor-shell.css";

export type EditorShellScrollModel = "page" | "contained";

const BOTTOM_WORKSPACE_COLLAPSED_HEIGHT_PX = 28;
const BOTTOM_WORKSPACE_MIN_HEIGHT_PX = 160;
const BOTTOM_WORKSPACE_DEFAULT_HEIGHT_PX = 240;
const BOTTOM_WORKSPACE_MAX_HEIGHT_PX = 480;
const BOTTOM_WORKSPACE_KEYBOARD_STEP_PX = 16;

function clampBottomWorkspaceHeight(heightPx: number): number {
  return Math.min(
    BOTTOM_WORKSPACE_MAX_HEIGHT_PX,
    Math.max(BOTTOM_WORKSPACE_MIN_HEIGHT_PX, heightPx),
  );
}

interface BottomWorkspaceResizeSession {
  readonly pointerId: number;
  readonly startClientY: number;
  readonly startHeightPx: number;
  readonly startCollapsed: boolean;
}

function EditorBottomWorkspace({ children }: { readonly children: ReactNode }) {
  const contentId = useId();
  const resizeSessionRef = useRef<BottomWorkspaceResizeSession | null>(null);
  const [heightPx, setHeightPx] = useState(BOTTOM_WORKSPACE_DEFAULT_HEIGHT_PX);
  const [collapsed, setCollapsed] = useState(false);
  const renderedHeightPx = collapsed ? BOTTOM_WORKSPACE_COLLAPSED_HEIGHT_PX : heightPx;

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowUp":
        setHeightPx((current) =>
          clampBottomWorkspaceHeight(
            collapsed
              ? BOTTOM_WORKSPACE_MIN_HEIGHT_PX
              : current + BOTTOM_WORKSPACE_KEYBOARD_STEP_PX,
          ),
        );
        setCollapsed(false);
        break;
      case "ArrowDown":
        if (!collapsed) {
          setHeightPx((current) =>
            clampBottomWorkspaceHeight(current - BOTTOM_WORKSPACE_KEYBOARD_STEP_PX),
          );
        }
        break;
      case "Home":
        setCollapsed(true);
        break;
      case "End":
        setHeightPx(BOTTOM_WORKSPACE_MAX_HEIGHT_PX);
        setCollapsed(false);
        break;
      case "Enter":
      case " ":
        setCollapsed((current) => !current);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeSessionRef.current = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startHeightPx: heightPx,
      startCollapsed: collapsed,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const nextHeightPx = session.startHeightPx + session.startClientY - event.clientY;
    setHeightPx(clampBottomWorkspaceHeight(Math.round(nextHeightPx)));
    setCollapsed(false);
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    resizeSessionRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handlePointerCancel(event: PointerEvent<HTMLButtonElement>) {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    resizeSessionRef.current = null;
    setHeightPx(session.startHeightPx);
    setCollapsed(session.startCollapsed);
  }

  return (
    <section
      className="sc-editor-bottom-workspace"
      data-state={collapsed ? "collapsed" : "expanded"}
      style={
        {
          "--sc-editor-bottom-workspace-height": `${renderedHeightPx}px`,
        } as CSSProperties
      }
    >
      <button
        type="button"
        className="sc-editor-bottom-workspace-resize-handle"
        role="separator"
        aria-label="Resize bottom workspace"
        aria-controls={contentId}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={BOTTOM_WORKSPACE_MAX_HEIGHT_PX}
        aria-valuenow={collapsed ? 0 : heightPx}
        aria-valuetext={collapsed ? "Collapsed" : `${heightPx} pixels, expanded`}
        onKeyDown={handleKeyDown}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div
        id={contentId}
        className="sc-editor-bottom-workspace-scroll"
        role="region"
        aria-label="Bottom workspace"
        hidden={collapsed}
      >
        {children}
      </div>
    </section>
  );
}

export interface EditorShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Primary work surface — the document editor or any future stage mode. */
  stage: ReactNode;
  /** Optional ref for overlay geometry that must use the unscaled editor stage. */
  stageRef?: Ref<HTMLDivElement>;
  /** Optional shell-local workspace below the Surface viewport. */
  bottomWorkspace?: ReactNode;
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
  /** Optional wide left navigator surface — Document Outline, hierarchy browser, etc. */
  leftNavigatorDock?: ReactNode;
  /** Optional wide right-side dock surface — agent panel, review, etc. */
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
 * Column order (left → right): leftNavigatorDock · leftRail · stage · rightRail · dock.
 * Rails live inside reserved shell columns so their horizontal position is
 * always measured in the same coordinate system as the stage and dock. They
 * use sticky vertical positioning to stay centered while the editor scrolls.
 */
export function EditorShell({
  stage,
  stageRef,
  bottomWorkspace,
  leftRail,
  reserveLeftRail = false,
  rightRail,
  reserveRightRail = false,
  leftNavigatorDock,
  dock,
  scrollModel = "page",
  className,
  ...rest
}: EditorShellProps) {
  return (
    <div className={cn("sc-editor-shell", className)} data-scroll-model={scrollModel} {...rest}>
      {leftNavigatorDock ? (
        <div className="sc-editor-dock-slot" data-side="left">
          {leftNavigatorDock}
        </div>
      ) : null}
      {leftRail || reserveLeftRail ? (
        <div className="sc-editor-rail-slot" data-side="left">
          {leftRail ? (
            <div className="sc-editor-rail" data-side="left">
              <EditorRailViewport side="left">{leftRail}</EditorRailViewport>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="sc-editor-stage-column">
        <div ref={stageRef} className="sc-editor-stage">
          {stage}
        </div>
        {bottomWorkspace ? <EditorBottomWorkspace>{bottomWorkspace}</EditorBottomWorkspace> : null}
      </div>
      {rightRail || reserveRightRail ? (
        <div className="sc-editor-rail-slot" data-side="right">
          {rightRail ? (
            <div className="sc-editor-rail" data-side="right">
              <EditorRailViewport side="right">{rightRail}</EditorRailViewport>
            </div>
          ) : null}
        </div>
      ) : null}
      {dock ? (
        <div className="sc-editor-dock-slot" data-side="right">
          {dock}
        </div>
      ) : null}
    </div>
  );
}
