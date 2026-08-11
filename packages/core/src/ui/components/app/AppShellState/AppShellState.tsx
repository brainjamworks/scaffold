import {
  CircleNotchIcon as CircleNotch,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import { type ReactNode, useId } from "react";

import { cn } from "@/lib/cn";
import { iconXl } from "@/ui/tokens/icon-sizes";

import "./AppShellState.css";

export interface AppShellStateProps {
  readonly action?: ReactNode;
  readonly className?: string;
  readonly description?: string;
  readonly kind: "error" | "loading";
  readonly testId?: string;
  readonly title: string;
}

/**
 * Full-workspace state for the Scaffold application shell.
 * Learner-facing Course runtime states must use a Course-owned treatment instead.
 */
export function AppShellState({
  action,
  className,
  description,
  kind,
  testId,
  title,
}: AppShellStateProps) {
  const titleId = useId();
  const isLoading = kind === "loading";

  return (
    <div
      aria-busy={isLoading || undefined}
      aria-labelledby={titleId}
      className={cn("sc-app-shell-state", className)}
      data-kind={kind}
      data-testid={testId}
      role={isLoading ? "status" : "alert"}
    >
      <div className="sc-app-shell-state__content">
        <span aria-hidden className="sc-app-shell-state__icon">
          {isLoading ? (
            <CircleNotch className="sc-app-shell-state__spinner" size={iconXl} weight="bold" />
          ) : (
            <WarningCircle size={iconXl} weight="fill" />
          )}
        </span>
        <div className="sc-app-shell-state__copy">
          <h2 className="sc-app-shell-state__title" id={titleId}>
            {title}
          </h2>
          {description ? <p className="sc-app-shell-state__description">{description}</p> : null}
        </div>
        {action ? <div className="sc-app-shell-state__action">{action}</div> : null}
      </div>
    </div>
  );
}
