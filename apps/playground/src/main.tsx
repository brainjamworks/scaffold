import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { INTERACTIONS_FIXTURE_ARTIFACT_ID } from "@scaffold/core/format";

import { PlaygroundApp } from "./PlaygroundApp";
import { PlaygroundResetButton } from "./PlaygroundResetButton";
import { LOCAL_ARTIFACT_ID } from "./ports/local-artifact-id";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

const interactionsFixtureRequested =
  new URLSearchParams(window.location.search).get("fixture") === "interactions";

createRoot(root).render(
  <StrictMode>
    <PlaygroundApp
      artifactId={
        interactionsFixtureRequested ? INTERACTIONS_FIXTURE_ARTIFACT_ID : LOCAL_ARTIFACT_ID
      }
      headerExtras={<PlaygroundResetButton />}
    />
  </StrictMode>,
);
