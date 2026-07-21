// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("script").forEach((script) => script.remove());
  delete window.ScaffoldMoodle;
  vi.resetModules();
});

describe("Moodle AMD bootstrap", () => {
  it("loads the configured module and mounts it after the script is ready", async () => {
    // @ts-expect-error Moodle owns this JavaScript AMD entry outside the TypeScript source root.
    const { init } = (await import("../../scaffold/amd/src/bootstrap.js")) as {
      init: (rootId: string, config: { bundleUrl: string }) => void;
    };
    const root = document.createElement("div");
    root.id = "scaffold-root";
    document.body.append(root);
    const mountMoodle = vi.fn();
    const append = vi.spyOn(document.head, "append").mockImplementation(() => undefined);

    init(root.id, { bundleUrl: "https://example.test/scaffold/moodle-ui.js" });

    const script = append.mock.calls[0]?.[0];
    expect(script).toBeInstanceOf(HTMLScriptElement);
    if (!(script instanceof HTMLScriptElement)) throw new Error("Expected module script");
    expect(script.type).toBe("module");
    expect(script.src).toBe("https://example.test/scaffold/moodle-ui.js");

    window.ScaffoldMoodle = { mountMoodle };
    script.dispatchEvent(new Event("load"));

    await vi.waitFor(() => {
      expect(mountMoodle).toHaveBeenCalledOnce();
      expect(mountMoodle).toHaveBeenCalledWith(
        root,
        { bundleUrl: "https://example.test/scaffold/moodle-ui.js" },
        expect.any(Function),
      );
    });
  });
});
