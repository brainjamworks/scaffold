import { describe, expect, it } from "vite-plus/test";

import { createAuthoringSaveMachine, type AuthoringSaveSnapshot } from "./authoring-save-machine";

function snapshot(sequence: number): AuthoringSaveSnapshot {
  return {
    generation: sequence,
    payload: {
      artifact: {
        id: "artifact-save-machine",
        title: `Snapshot ${sequence}`,
        mode: "page",
        content: { type: "doc", content: [] },
      },
    },
    saveArtifact: async () => ({ artifactRevision: `revision-${sequence}` }),
    sequence,
    source: "artifact-save-machine",
  };
}

describe("authoring save machine", () => {
  it("accepts work after a StrictMode activation replay", async () => {
    const machine = createAuthoringSaveMachine("artifact-save-machine");

    machine.activate();
    machine.deactivate();
    machine.activate();

    const next = snapshot(machine.reserveSequence());
    const outcome = machine.enqueue(next);

    expect(machine.beginDrain()).toBe(true);
    expect(machine.takeNext()).toBe(next);
    machine.finishInFlight(next);
    machine.settleThrough(next.sequence, true);
    machine.finishDrain();

    await expect(outcome).resolves.toBe(true);
    expect(machine.isBusy()).toBe(false);
  });
});
