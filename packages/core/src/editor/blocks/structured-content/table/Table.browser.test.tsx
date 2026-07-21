import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import "./Table.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Table presentation", () => {
  it("preserves fixed geometry, cell selection, and the column resize hit zone", async () => {
    const host = document.createElement("div");
    host.style.width = "480px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <div className="ProseMirror">
        <table className="sc-table">
          <tbody>
            <tr>
              <th>
                <p>Column one</p>
                <div className="column-resize-handle" />
              </th>
              <th>
                <p>Column two</p>
              </th>
            </tr>
            <tr>
              <td className="selectedCell">
                <p>Selected cell</p>
              </td>
              <td>
                <p>Ordinary cell</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>,
    );

    await waitForCondition(() => host.querySelector(".sc-table"));
    const table = requiredElement<HTMLTableElement>(host, ".sc-table");
    const selectedCell = requiredElement<HTMLTableCellElement>(table, ".selectedCell");
    const ordinaryCell = requiredElement<HTMLTableCellElement>(table, "td:not(.selectedCell)");
    const resizeHandle = requiredElement<HTMLElement>(table, ".column-resize-handle");

    expect(table.getBoundingClientRect().width).toBeCloseTo(480, 0);
    expect(getComputedStyle(table).tableLayout).toBe("fixed");
    expect(getComputedStyle(table).borderCollapse).toBe("separate");
    expect(getComputedStyle(selectedCell).backgroundColor).not.toBe(
      getComputedStyle(ordinaryCell).backgroundColor,
    );
    expect(getComputedStyle(selectedCell).boxShadow).not.toBe("none");
    expect(getComputedStyle(resizeHandle).width).toBe("4px");
    expect(getComputedStyle(resizeHandle).pointerEvents).toBe("auto");
    expect(getComputedStyle(resizeHandle, "::after").opacity).toBe("0");
    expect(getComputedStyle(resizeHandle, "::after").width).toBe("2px");
  });
});

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Table state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
