// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { createEditorDisposalPool } from "./disposable-editor";

describe("createEditorDisposalPool", () => {
  it("destroys every tracked live editor and tolerates repeated cleanup", () => {
    const pool = createEditorDisposalPool();

    try {
      const alreadyDestroyed = pool.track(
        new Editor({ extensions: [StarterKit.configure({ undoRedo: false })] }),
      );
      const live = pool.track(
        new Editor({ extensions: [StarterKit.configure({ undoRedo: false })] }),
      );

      alreadyDestroyed.destroy();
      pool.destroyAll();

      expect(alreadyDestroyed.isDestroyed).toBe(true);
      expect(live.isDestroyed).toBe(true);
      expect(() => pool.destroyAll()).not.toThrow();
    } finally {
      pool.destroyAll();
    }
  });
});
