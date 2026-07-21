// @vitest-environment happy-dom
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createBrowserMediaPort } from "./createBrowserMediaPort";
import { resetBrowserStorage } from "./browserStorageDb";

const pngFile = (name = "pic.png", size = 4) =>
  new File([new Uint8Array(size)], name, { type: "image/png" });

describe("createBrowserMediaPort", () => {
  let createdUrls: string[];
  let revokedUrls: string[];

  const makePort = () => {
    createdUrls = [];
    revokedUrls = [];
    return createBrowserMediaPort({
      idFactory: (() => {
        let n = 0;
        return () => `media-${++n}`;
      })(),
      createObjectUrl: (blob) => {
        const url = `blob:fake/${createdUrls.length + 1}`;
        createdUrls.push(url);
        void blob;
        return url;
      },
      revokeObjectUrl: (url) => {
        revokedUrls.push(url);
      },
    });
  };

  beforeEach(async () => {
    await resetBrowserStorage();
  });

  afterEach(async () => {
    await resetBrowserStorage();
  });

  it("uploads a file and resolves the same URL on subsequent reads", async () => {
    const port = makePort();
    const result = await port.upload(pngFile(), { mediaType: "image" });
    expect(result.id).toBe("media-1");
    expect(result.url).toBe("blob:fake/1");
    expect(result.mediaType).toBe("image");
    expect(result.size).toBe(4);

    const resolved = await port.resolve(result.id);
    expect(resolved).toBe("blob:fake/1");
    // Same URL returned (cached), not a new allocation.
    expect(createdUrls).toHaveLength(1);
  });

  it("reports upload progress to the callback", async () => {
    const port = makePort();
    const progress = vi.fn();
    await port.upload(pngFile(), { mediaType: "image" }, progress);
    expect(progress).toHaveBeenCalledWith(0);
    expect(progress).toHaveBeenCalledWith(100);
  });

  it("rejects resolve for an unknown id", async () => {
    const port = makePort();
    await expect(port.resolve("nope")).rejects.toThrow(/not found/);
  });

  it("lists uploads newest-first with metadata intact", async () => {
    const port = makePort();
    await port.upload(pngFile("a.png"), { mediaType: "image" });
    await new Promise((r) => setTimeout(r, 5));
    await port.upload(pngFile("b.png"), { mediaType: "image" });

    const items = await port.list?.();
    expect(items).toHaveLength(2);
    expect(items?.[0]?.fileName).toBe("b.png");
    expect(items?.[1]?.fileName).toBe("a.png");
  });

  it("survives a fresh port instance against the same DB", async () => {
    const a = makePort();
    const { id } = await a.upload(pngFile("persist.png"), {
      mediaType: "image",
    });

    const b = makePort();
    const resolved = await b.resolve(id);
    expect(resolved).toMatch(/^blob:fake/);
    const items = await b.list?.();
    expect(items?.map((it) => it.fileName)).toEqual(["persist.png"]);
  });

  it("releaseUrls revokes all cached URLs and clears the cache", async () => {
    const port = makePort();
    await port.upload(pngFile("a.png"), { mediaType: "image" });
    await port.upload(pngFile("b.png"), { mediaType: "image" });
    expect(createdUrls).toHaveLength(2);

    port.releaseUrls();
    expect(revokedUrls).toHaveLength(2);

    // Next resolve allocates a new URL because the cache is empty.
    await port.resolve("media-1");
    expect(createdUrls).toHaveLength(3);
  });
});
