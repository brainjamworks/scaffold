import { describe, expect, it } from "vite-plus/test";

import config from "./vite.config";

describe("XBlock build asset naming", () => {
  it("content-hashes emitted assets so iframe styles cannot remain stale", () => {
    const output = config.build?.rollupOptions?.output;

    expect(Array.isArray(output)).toBe(false);
    expect(output && !Array.isArray(output) ? output.assetFileNames : undefined).toBe(
      "assets/[name]-[hash][extname]",
    );
  });
});
