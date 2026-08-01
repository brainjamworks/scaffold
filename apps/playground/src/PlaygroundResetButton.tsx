import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react";
import { AuthoringHeaderIconButton } from "@scaffold/core/authoring";

import { browserMediaPort } from "./ports/browserMediaPort";
import { resetBrowserStorage } from "./ports/browserStorageDb";

/**
 * Reset action for the playground header.
 *
 * Wipes IndexedDB (doc + media) and revokes any cached object URLs,
 * then reloads the page so React state restarts from a blank doc.
 */
export function PlaygroundResetButton() {
  const reset = async () => {
    const ok = window.confirm(
      "Reset the playground? This clears the page you authored on this device.",
    );
    if (!ok) return;
    browserMediaPort.releaseUrls();
    await resetBrowserStorage();
    window.location.reload();
  };

  return (
    <AuthoringHeaderIconButton
      onClick={() => {
        void reset();
      }}
      aria-label="Reset playground"
      tooltip="Reset playground"
    >
      <ArrowCounterClockwise size={16} aria-hidden />
    </AuthoringHeaderIconButton>
  );
}
