import "@scaffold/core/styles.css";
import "katex/dist/katex.min.css";
import "./styles.css";

import { mountXBlockInner } from "./mount-inner-lifecycle";
import { mountXBlockStudio } from "./mount-studio";

mountXBlockInner({
  view: "studio",
  mount: mountXBlockStudio,
});
