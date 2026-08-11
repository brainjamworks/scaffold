import "@scaffold/core/styles.css";
import "katex/dist/katex.min.css";
import "../styles.css";

import { mountMoodleLearner } from "../mount-learner";
import { mountMoodleInner } from "./mount-inner-lifecycle";

const root = document.getElementById("scaffold-moodle-inner-root");
if (!(root instanceof HTMLElement)) {
  throw new Error("Scaffold learner inner document root is missing.");
}

mountMoodleInner({
  root,
  mount(innerRoot, config) {
    if (config.surface !== "learner") {
      throw new Error("Scaffold learner entry received an authoring configuration.");
    }
    return mountMoodleLearner(innerRoot, config);
  },
});
