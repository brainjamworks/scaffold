// @vitest-environment happy-dom

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";

import {
  createInteractionOwnerSnapshot,
  InteractionOwnerSource,
} from "../model/interaction-owner-state";
import { createInteractionStore } from "./interaction-store";
import {
  InteractionProvider,
  useInteractionCommands,
  useInteractionSelector,
  useInteractionStore,
  useInteractionSnapshot,
} from "./interaction-provider";

function EffectiveOwnerSource() {
  const source = useInteractionSelector((state) => state.snapshot.owners.effectiveOwner.source);

  return <output data-testid="effective-owner-source">{source}</output>;
}

function SnapshotSelectionMode() {
  const snapshot = useInteractionSnapshot();

  return <output data-testid="selection-mode">{snapshot.selection.mode}</output>;
}

function DismissCommandButton() {
  const commands = useInteractionCommands();

  return (
    <button type="button" onClick={() => commands.dismissInteraction()}>
      Dismiss
    </button>
  );
}

function ProvidedStoreProbe({ expected }: { expected: unknown }) {
  const store = useInteractionStore();

  return (
    <output data-testid="store-identity">
      {store === expected ? "same-store" : "different-store"}
    </output>
  );
}

describe("InteractionProvider", () => {
  it("exposes the provided store instance through context", () => {
    const store = createInteractionStore();

    render(
      <InteractionProvider store={store}>
        <ProvidedStoreProbe expected={store} />
      </InteractionProvider>,
    );

    expect(screen.getByTestId("store-identity").textContent).toBe("same-store");
  });

  it("re-renders selector consumers when a published snapshot changes the selected slice", () => {
    const store = createInteractionStore();

    render(
      <InteractionProvider store={store}>
        <EffectiveOwnerSource />
      </InteractionProvider>,
    );

    expect(screen.getByTestId("effective-owner-source").textContent).toBe(
      InteractionOwnerSource.None,
    );

    act(() => {
      store.getState().publishSnapshot(
        createInteractionOwnerSnapshot({
          explicitOwner: { id: "layout-1", kind: "layout" },
        }),
      );
    });

    expect(screen.getByTestId("effective-owner-source").textContent).toBe(
      InteractionOwnerSource.Explicit,
    );
  });

  it("exposes the latest snapshot through useInteractionSnapshot", () => {
    const store = createInteractionStore();

    render(
      <InteractionProvider store={store}>
        <SnapshotSelectionMode />
      </InteractionProvider>,
    );

    expect(screen.getByTestId("selection-mode").textContent).toBe("otherSelection");

    act(() => {
      store.getState().publishSnapshot(
        createInteractionOwnerSnapshot({
          selection: { mode: "textCaret" },
        }),
      );
    });

    expect(screen.getByTestId("selection-mode").textContent).toBe("textCaret");
  });

  it("exposes command ports through useInteractionCommands", async () => {
    const user = userEvent.setup();
    let dismissed = 0;
    const store = createInteractionStore({
      commandPorts: {
        dismissInteraction: () => {
          dismissed += 1;
          return true;
        },
      },
    });

    render(
      <InteractionProvider store={store}>
        <DismissCommandButton />
      </InteractionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(dismissed).toBe(1);
  });

  it("throws a clear error when hooks are used outside the provider", () => {
    expect(() => render(<EffectiveOwnerSource />)).toThrow(/InteractionProvider/);
  });
});
