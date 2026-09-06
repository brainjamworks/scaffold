import { useEffect, useRef, useState } from "react";

import type { ScaffoldAuthoringSaveState } from "./AuthoringHeaderActions";
import type { AuthoringSaveController } from "./authoring-save-controller";
import type { AuthoringSaveBinding } from "./use-authoring-save";

const SAVE_OK_DISPLAY_MS = 2_000;

interface PreviousSaveActivity {
  readonly controller: AuthoringSaveController;
  readonly activity: "scheduled" | "saving" | "idle";
}

export function useAuthoringSaveLabel(binding: AuthoringSaveBinding): ScaffoldAuthoringSaveState {
  const [successfulOwner, setSuccessfulOwner] = useState<AuthoringSaveController | null>(null);
  const previousActivityRef = useRef<PreviousSaveActivity | null>(null);

  const controller = binding.status === "ready" ? binding.controller : null;
  const snapshot = binding.status === "ready" ? binding.snapshot : null;

  useEffect(() => {
    setSuccessfulOwner(null);
    if (!controller || !snapshot) {
      previousActivityRef.current = null;
      return;
    }

    const previous = previousActivityRef.current;
    previousActivityRef.current = { controller, activity: snapshot.activity };
    if (
      previous?.controller !== controller ||
      previous.activity !== "saving" ||
      snapshot.activity !== "idle" ||
      !snapshot.lastSaved ||
      snapshot.lastFailure ||
      snapshot.documentStatus === "invalid"
    ) {
      return;
    }

    setSuccessfulOwner(controller);
    const timeout = window.setTimeout(() => setSuccessfulOwner(null), SAVE_OK_DISPLAY_MS);
    return () => window.clearTimeout(timeout);
  }, [
    controller,
    snapshot,
    snapshot?.activity,
    snapshot?.documentStatus,
    snapshot?.lastFailure,
    snapshot?.lastSaved,
  ]);

  if (!controller || !snapshot) return "idle";
  if (snapshot.documentStatus === "invalid" || snapshot.lastFailure) return "error";
  if (snapshot.activity !== "idle") return "saving";
  return successfulOwner === controller ? "saved" : "idle";
}
