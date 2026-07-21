import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PlaygroundApp } from "./PlaygroundApp";
import { PlaygroundResetButton } from "./PlaygroundResetButton";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <PlaygroundApp headerExtras={<PlaygroundResetButton />} />
  </StrictMode>,
);
