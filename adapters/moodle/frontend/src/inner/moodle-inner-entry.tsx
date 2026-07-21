import "@scaffold/core/styles.css";
import "katex/dist/katex.min.css";
import "../styles.css";

import { mountMoodle } from "../mount";
import { mountMoodleInner } from "./mount-inner-lifecycle";

const root = document.getElementById("scaffold-moodle-inner-root");
if (!(root instanceof HTMLElement)) {
  throw new Error("Scaffold inner document root is missing.");
}

mountMoodleInner({ root, mount: mountMoodle });
