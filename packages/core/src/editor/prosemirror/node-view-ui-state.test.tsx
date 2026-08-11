// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { nodeViewUiStateKey, useNodeViewOpenState } from "./node-view-ui-state";

afterEach(cleanup);

describe("NodeView UI open state", () => {
  it("survives a NodeView consumer unmount and immediate remount", () => {
    const key = nodeViewUiStateKey({ owner: "image", surface: "picker", id: "image_000001" });
    const first = render(<OpenStateButton stateKey={key} />);

    fireEvent.click(screen.getByRole("button", { name: "Open surface" }));
    expect(screen.getByRole("button", { name: "Close surface" })).not.toBeNull();

    first.unmount();
    render(<OpenStateButton stateKey={key} />);

    expect(screen.getByRole("button", { name: "Close surface" })).not.toBeNull();
  });

  it("keeps separate owners and surfaces in separate state namespaces", () => {
    expect(nodeViewUiStateKey({ owner: "image", surface: "picker", id: "node_0000001" })).toBe(
      "image:picker:node_0000001",
    );
    expect(nodeViewUiStateKey({ owner: "image", surface: "workspace", id: "node_0000001" })).toBe(
      "image:workspace:node_0000001",
    );
  });
});

function OpenStateButton({ stateKey }: { stateKey: string | null }) {
  const [open, setOpen] = useNodeViewOpenState(stateKey);

  return (
    <button type="button" onClick={() => setOpen(!open)}>
      {open ? "Close surface" : "Open surface"}
    </button>
  );
}
