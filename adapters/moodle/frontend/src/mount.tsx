import { createRoot } from "react-dom/client";
import { ScaffoldServicesProvider } from "@scaffold/core/runtime";

import { MoodleApp } from "./MoodleApp";
import { createMoodleRuntimePorts } from "./ports";
import type { MoodleApplicationConfig } from "./types";

export function mountMoodle(element: Element, config: MoodleApplicationConfig): void {
  const mount = document.createElement("div");
  mount.className = "sc-moodle-react-root";
  element.appendChild(mount);

  const root = createRoot(mount);

  if (config.surface === "authoring") {
    root.render(<MoodleApp config={config} />);
    return;
  }

  root.render(
    <ScaffoldServicesProvider ports={createMoodleRuntimePorts(config.cmid)}>
      <MoodleApp config={config} />
    </ScaffoldServicesProvider>,
  );
}
