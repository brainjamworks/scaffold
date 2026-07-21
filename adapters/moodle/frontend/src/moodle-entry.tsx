import {
  createIsolatedScaffoldFrame,
  type IsolatedScaffoldFrame,
  type MoodleCall,
} from "./outer/create-isolated-scaffold-frame";
import type { MoodleOuterBootstrapConfig } from "./types";

const mountedFrames = new WeakMap<HTMLElement, IsolatedScaffoldFrame>();

export function mountMoodle(
  root: HTMLElement,
  config: MoodleOuterBootstrapConfig,
  callMoodle: MoodleCall,
): void {
  mountedFrames.get(root)?.destroy();
  mountedFrames.delete(root);

  try {
    const frame = createIsolatedScaffoldFrame({ container: root, config, callMoodle });
    mountedFrames.set(root, frame);
  } catch (error) {
    root.replaceChildren();
    const alert = document.createElement("div");
    alert.className = "sc-moodle-frame-error";
    alert.setAttribute("role", "alert");
    alert.textContent = error instanceof Error ? error.message : "Scaffold could not be loaded.";
    root.append(alert);
  }
}

declare global {
  interface Window {
    ScaffoldMoodle?: {
      mountMoodle: typeof mountMoodle;
    };
  }
}

window.ScaffoldMoodle = { mountMoodle };
