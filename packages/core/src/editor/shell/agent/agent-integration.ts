import type { Editor } from "@tiptap/core";
import type { ComponentType, ReactNode } from "react";

export type ScaffoldAgentWorkspaceContribution =
  | {
      mode: "editing";
      dock: ReactNode | null;
    }
  | {
      mode: "review";
      dock: ReactNode | null;
      stage: ReactNode;
    };

export interface ScaffoldAgentIntegrationProps {
  artifactId: string | null;
  editor: Editor | null;
  editable: boolean;
  onClose: () => void;
  renderWorkspace: (contribution: ScaffoldAgentWorkspaceContribution) => ReactNode;
}

export type ScaffoldAgentIntegration = ComponentType<ScaffoldAgentIntegrationProps>;
