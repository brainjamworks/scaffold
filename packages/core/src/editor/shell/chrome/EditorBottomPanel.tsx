import {
  createContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { XIcon as X } from "@phosphor-icons/react";

import { IconButton } from "@/ui/components/IconButton/IconButton";
import { iconXs } from "@/ui/tokens/icon-sizes";

import "./editor-bottom-panel.css";

export interface EditorBottomPanelTab {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

/**
 * Portal targets owned by the panel header. The active tab's content portals
 * its toolbar controls into `headerActions` and transient errors into
 * `status`; both are null until the header mounts. Null context means the
 * content renders standalone and must render inline instead.
 */
export interface BottomPanelSlots {
  readonly headerActions: HTMLDivElement | null;
  readonly status: HTMLDivElement | null;
}

export const BottomPanelSlotsContext = createContext<BottomPanelSlots | null>(null);

export interface EditorBottomPanelProps {
  readonly tabs: ReadonlyArray<EditorBottomPanelTab>;
  readonly activeTabId: string;
  readonly onTabChange: (id: string) => void;
  readonly onClose: () => void;
  /** Label for the tablist. */
  readonly tabsLabel: string;
  /** Label for the content region. Default "Bottom workspace". */
  readonly regionLabel?: string;
  readonly initialHeightPx?: number; // default 240, same clamps as today
  /**
   * sessionStorage key for per-session height memory. When set, the stored
   * height seeds the initial height and every finished resize or collapse
   * toggle persists the current height. All storage access is try/caught.
   */
  readonly heightStorageKey?: string;
}

const BOTTOM_WORKSPACE_COLLAPSED_HEIGHT_PX = 28;
const BOTTOM_WORKSPACE_MIN_HEIGHT_PX = 160;
const BOTTOM_WORKSPACE_DEFAULT_HEIGHT_PX = 240;
const BOTTOM_WORKSPACE_MAX_HEIGHT_PX = 480;
const BOTTOM_WORKSPACE_KEYBOARD_STEP_PX = 16;
const BOTTOM_WORKSPACE_MIN_STAGE_HEIGHT_PX = 160;

function clampBottomWorkspaceHeight(heightPx: number, maximumHeightPx: number): number {
  return Math.min(
    maximumHeightPx,
    Math.max(Math.min(BOTTOM_WORKSPACE_MIN_HEIGHT_PX, maximumHeightPx), heightPx),
  );
}

function readStoredHeightPx(key: string | undefined, fallbackPx: number): number {
  if (!key) return fallbackPx;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return fallbackPx;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallbackPx;
    return clampBottomWorkspaceHeight(Math.round(parsed), BOTTOM_WORKSPACE_MAX_HEIGHT_PX);
  } catch {
    return fallbackPx;
  }
}

function writeStoredHeightPx(key: string | undefined, heightPx: number): void {
  if (!key) return;
  try {
    sessionStorage.setItem(key, String(Math.round(heightPx)));
  } catch {
    // Storage unavailable (private mode, disabled): keep the in-memory height.
  }
}

interface BottomWorkspaceResizeSession {
  readonly pointerId: number;
  readonly startClientY: number;
  readonly startHeightPx: number;
  readonly startCollapsed: boolean;
}

export function EditorBottomPanel({
  tabs,
  activeTabId,
  onTabChange,
  onClose,
  tabsLabel,
  regionLabel = "Bottom workspace",
  initialHeightPx = BOTTOM_WORKSPACE_DEFAULT_HEIGHT_PX,
  heightStorageKey,
}: EditorBottomPanelProps) {
  const contentId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const resizeSessionRef = useRef<BottomWorkspaceResizeSession | null>(null);
  const heightStorageKeyRef = useRef(heightStorageKey);
  heightStorageKeyRef.current = heightStorageKey;
  const [heightPx, setHeightPx] = useState(() =>
    readStoredHeightPx(heightStorageKey, initialHeightPx),
  );
  const [availableHeightPx, setAvailableHeightPx] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [headerActionsElement, setHeaderActionsElement] = useState<HTMLDivElement | null>(null);
  const [statusElement, setStatusElement] = useState<HTMLDivElement | null>(null);
  const slots = useMemo<BottomPanelSlots>(
    () => ({ headerActions: headerActionsElement, status: statusElement }),
    [headerActionsElement, statusElement],
  );
  const maximumHeightPx =
    availableHeightPx === null
      ? BOTTOM_WORKSPACE_MAX_HEIGHT_PX
      : Math.min(
          BOTTOM_WORKSPACE_MAX_HEIGHT_PX,
          Math.max(
            BOTTOM_WORKSPACE_COLLAPSED_HEIGHT_PX,
            availableHeightPx - BOTTOM_WORKSPACE_MIN_STAGE_HEIGHT_PX,
          ),
        );
  const expandedHeightPx = clampBottomWorkspaceHeight(heightPx, maximumHeightPx);
  const renderedHeightPx = collapsed ? BOTTOM_WORKSPACE_COLLAPSED_HEIGHT_PX : expandedHeightPx;
  const tabpanelId = `${contentId}-tabpanel`;
  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  useLayoutEffect(() => {
    const centreColumn =
      panelRef.current?.closest(".sc-editor-centre") ?? panelRef.current?.parentElement;
    if (!(centreColumn instanceof HTMLElement)) return;
    const updateAvailableHeight = () => {
      if (centreColumn.clientHeight > 0) setAvailableHeightPx(centreColumn.clientHeight);
    };
    updateAvailableHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateAvailableHeight);
    observer.observe(centreColumn);
    return () => observer.disconnect();
  }, []);

  // Mirror the workspace height onto the centre column: the rail sizing variable reads it
  // from an ancestor, and custom properties do not inherit up from the panel section.
  useLayoutEffect(() => {
    const centreColumn =
      panelRef.current?.closest(".sc-editor-centre") ?? panelRef.current?.parentElement;
    if (!(centreColumn instanceof HTMLElement)) return;
    centreColumn.style.setProperty(
      "--sc-editor-bottom-workspace-height",
      `${renderedHeightPx}px`,
    );
    return () => {
      centreColumn.style.removeProperty("--sc-editor-bottom-workspace-height");
    };
  }, [renderedHeightPx]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const storageKey = heightStorageKeyRef.current;
    switch (event.key) {
      case "ArrowUp": {
        const nextHeightPx = clampBottomWorkspaceHeight(
          collapsed
            ? Math.min(BOTTOM_WORKSPACE_MIN_HEIGHT_PX, maximumHeightPx)
            : expandedHeightPx + BOTTOM_WORKSPACE_KEYBOARD_STEP_PX,
          maximumHeightPx,
        );
        setHeightPx(nextHeightPx);
        writeStoredHeightPx(storageKey, nextHeightPx);
        setCollapsed(false);
        break;
      }
      case "ArrowDown":
        if (!collapsed) {
          const nextHeightPx = clampBottomWorkspaceHeight(
            expandedHeightPx - BOTTOM_WORKSPACE_KEYBOARD_STEP_PX,
            maximumHeightPx,
          );
          setHeightPx(nextHeightPx);
          writeStoredHeightPx(storageKey, nextHeightPx);
        }
        break;
      case "Home":
        setCollapsed(true);
        writeStoredHeightPx(storageKey, heightPx);
        break;
      case "End":
        setHeightPx(maximumHeightPx);
        writeStoredHeightPx(storageKey, maximumHeightPx);
        setCollapsed(false);
        break;
      case "Enter":
      case " ":
        setCollapsed((current) => !current);
        writeStoredHeightPx(storageKey, heightPx);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !event.defaultPrevented) onClose();
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeSessionRef.current = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startHeightPx: expandedHeightPx,
      startCollapsed: collapsed,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const nextHeightPx = session.startHeightPx + session.startClientY - event.clientY;
    setHeightPx(clampBottomWorkspaceHeight(Math.round(nextHeightPx), maximumHeightPx));
    setCollapsed(false);
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    resizeSessionRef.current = null;
    writeStoredHeightPx(heightStorageKeyRef.current, heightPx);
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
      ref={panelRef}
      className="sc-editor-bottom-panel sc-editor-bottom-workspace"
      data-state={collapsed ? "collapsed" : "expanded"}
      style={
        {
          "--sc-editor-bottom-workspace-height": `${renderedHeightPx}px`,
        } as CSSProperties
      }
      onKeyDown={handlePanelKeyDown}
    >
      <button
        type="button"
        className="sc-editor-bottom-panel-resize-handle sc-editor-bottom-workspace-resize-handle"
        role="separator"
        aria-label="Resize bottom workspace"
        aria-controls={contentId}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={maximumHeightPx}
        aria-valuenow={collapsed ? 0 : expandedHeightPx}
        aria-valuetext={collapsed ? "Collapsed" : `${expandedHeightPx} pixels, expanded`}
        onKeyDown={handleKeyDown}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div className="sc-editor-bottom-panel-header">
        <div className="sc-editor-bottom-panel-tablist" role="tablist" aria-label={tabsLabel}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`${contentId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={tab.id === activeTabId}
              aria-controls={tabpanelId}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div
          className="sc-editor-bottom-panel-header-actions"
          ref={setHeaderActionsElement}
        />
        <IconButton
          size="sm"
          className="sc-editor-bottom-panel-close"
          aria-label="Close workspace"
          onClick={onClose}
        >
          <X size={iconXs} aria-hidden />
        </IconButton>
      </div>
      <div className="sc-editor-bottom-panel-status" ref={setStatusElement} />
      <div
        id={contentId}
        className="sc-editor-bottom-panel-scroll sc-editor-bottom-workspace-scroll"
        role="region"
        aria-label={regionLabel}
        hidden={collapsed}
      >
        {activeTab ? (
          <BottomPanelSlotsContext.Provider value={slots}>
            <div
              id={tabpanelId}
              className="sc-editor-bottom-panel-tabpanel"
              role="tabpanel"
              aria-labelledby={`${contentId}-tab-${activeTab.id}`}
            >
              {activeTab.content}
            </div>
          </BottomPanelSlotsContext.Provider>
        ) : null}
      </div>
    </section>
  );
}
