import { createRoot } from "react-dom/client";

import { MoodleLearnerRoot } from "./MoodleLearnerRoot";
import type { MoodleApplicationConfig } from "./types";

export function mountMoodleLearner(
  element: Element,
  config: Extract<MoodleApplicationConfig, { surface: "learner" }>,
): void {
  const mount = document.createElement("div");
  mount.className = "sc-moodle-react-root";
  element.appendChild(mount);
  createRoot(mount).render(<MoodleLearnerRoot config={config} />);
}
