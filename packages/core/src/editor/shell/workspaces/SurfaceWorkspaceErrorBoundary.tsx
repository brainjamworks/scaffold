import { cloneElement, Component, type ReactElement, type ReactNode } from "react";

import { Button } from "@/ui/components/Button/Button";

import "./surface-workspace-error-boundary.css";

export interface SurfaceWorkspaceErrorBoundaryProps {
  /** Tab name used in the fallback message. */
  readonly tabLabel: string;
  /** Exactly one element: the tab content to remount on retry. */
  readonly children: ReactElement;
}

interface SurfaceWorkspaceErrorBoundaryState {
  readonly error: Error | null;
  readonly retryNonce: number;
}

/**
 * Per-tab crash containment for the Surface workspaces panel. One tab
 * throwing shows the tokenised fallback with Retry while the sibling tab,
 * the tablist and Close keep working. Retry clears the error and bumps a
 * key on the tab content so it remounts from scratch instead of resuming
 * the crashed tree. No wrapper element: the key lands on the content
 * element itself, so tabpanel layout CSS is untouched.
 */
export class SurfaceWorkspaceErrorBoundary extends Component<
  SurfaceWorkspaceErrorBoundaryProps,
  SurfaceWorkspaceErrorBoundaryState
> {
  state: SurfaceWorkspaceErrorBoundaryState = { error: null, retryNonce: 0 };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  private readonly handleRetry = (): void => {
    this.setState((state) => ({ error: null, retryNonce: state.retryNonce + 1 }));
  };

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div className="sc-surface-workspace-error" role="alert">
          <p>{this.props.tabLabel} ran into a problem.</p>
          <Button size="sm" variant="ghost" onClick={this.handleRetry}>
            Retry
          </Button>
        </div>
      );
    }
    return cloneElement(this.props.children, { key: this.state.retryNonce });
  }
}
