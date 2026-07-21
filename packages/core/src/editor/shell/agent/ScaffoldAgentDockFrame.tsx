import { XIcon as X } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { IconButton } from "@/ui/components/IconButton/IconButton";
import { Pill } from "@/ui/components/Pill/Pill";
import { iconSm } from "@/ui/tokens/icon-sizes";

import "./scaffold-agent-dock.css";

export interface ScaffoldAgentDockFrameProps {
  connection: "ready" | "not-connected";
  headerActions?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  footer: ReactNode;
}

export function ScaffoldAgentDockFrame({
  connection,
  headerActions,
  onClose,
  children,
  footer,
}: ScaffoldAgentDockFrameProps) {
  return (
    <aside
      aria-label="Scaffold Agent"
      className="sc-authoring-agent-dock"
      data-testid="authoring-agent-dock"
    >
      <header className="sc-authoring-agent-dock-header">
        <div className="sc-authoring-agent-dock-heading">
          <h2 className="sc-authoring-agent-dock-title">Scaffold Agent</h2>
          <Pill variant={connection === "ready" ? "info" : "neutral"} size="sm">
            {connection === "ready" ? "ready" : "not connected"}
          </Pill>
        </div>
        {headerActions || onClose ? (
          <div className="sc-authoring-agent-dock-header-actions">
            {headerActions}
            {onClose ? (
              <IconButton
                variant="ghost"
                size="md"
                type="button"
                onClick={onClose}
                aria-label="Close Scaffold Agent"
              >
                <X size={iconSm} />
              </IconButton>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="sc-authoring-agent-dock-body">
        <div className="sc-authoring-agent-dock-scroll" aria-live="polite">
          {children}
        </div>
        {footer}
      </div>
    </aside>
  );
}
