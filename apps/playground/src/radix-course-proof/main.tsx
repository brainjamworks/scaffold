import "@radix-ui/themes/styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { RadixCourseProof } from "./RadixCourseProof";
import "./proof.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <RadixCourseProof />
  </StrictMode>,
);
