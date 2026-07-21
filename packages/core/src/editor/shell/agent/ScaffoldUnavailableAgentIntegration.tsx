import type { ScaffoldAgentIntegrationProps } from "./agent-integration";
import { ScaffoldUnavailableAgentDock } from "./ScaffoldUnavailableAgentDock";

export function ScaffoldUnavailableAgentIntegration({
  onClose,
  renderWorkspace,
}: ScaffoldAgentIntegrationProps) {
  return renderWorkspace({
    mode: "editing",
    dock: <ScaffoldUnavailableAgentDock onClose={onClose} />,
  });
}
