import "@scaffold/core/styles.css";
import "katex/dist/katex.min.css";
import "./styles.css";

import { mountXBlockInner } from "./mount-inner-lifecycle";
import { mountXBlockStudent } from "./mount-student";

mountXBlockInner({
  view: "student",
  mount: mountXBlockStudent,
});
