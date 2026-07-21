// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { resolveSurfaceImagePick } from "../../authoring/chrome/surface-image-pick";
import { SurfaceOwnedImageSlot } from "./surface-owned-image-slot";

describe("SurfaceOwnedImageSlot", () => {
  it("keeps the declared role stable across missing and empty states", () => {
    const { rerender } = render(<SurfaceOwnedImageSlot role="secondary" />);
    const slot = screen.getByTestId("surface-owned-image-slot");

    expect(slot.getAttribute("data-image-role")).toBe("secondary");
    expect(slot.getAttribute("data-image-status")).toBe("missing");
    expect(slot.getAttribute("data-image-position")).toBe("center");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();

    rerender(<SurfaceOwnedImageSlot role="secondary" image={{}} />);
    expect(slot.getAttribute("data-image-role")).toBe("secondary");
    expect(slot.getAttribute("data-image-status")).toBe("empty");
  });

  it("renders a semantic described image and a decorative undescribed image", () => {
    const { rerender } = render(
      <SurfaceOwnedImageSlot
        role="primary"
        image={{ imageUrl: "https://example.test/one.png", imageAlt: "Primary subject" }}
      />,
    );

    expect(screen.getByRole<HTMLImageElement>("img", { name: "Primary subject" }).src).toBe(
      "https://example.test/one.png",
    );

    rerender(
      <SurfaceOwnedImageSlot role="primary" image={{ imageUrl: "https://example.test/one.png" }} />,
    );
    expect(screen.getByAltText("").getAttribute("alt")).toBe("");
  });

  it("adds choose and replace controls only to editable authoring slots", async () => {
    const user = userEvent.setup();
    const onChooseImage = vi.fn();
    const { rerender } = render(
      <SurfaceOwnedImageSlot
        role="primary"
        image={{}}
        emptyAction={<button onClick={onChooseImage}>Choose primary image</button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Choose primary image" }));
    expect(onChooseImage).toHaveBeenCalledTimes(1);

    rerender(
      <SurfaceOwnedImageSlot
        role="primary"
        image={{ imageUrl: "https://example.test/one.png" }}
        replaceAction={<button onClick={onChooseImage}>Replace primary image</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Replace primary image" }));
    expect(onChooseImage).toHaveBeenCalledTimes(2);

    rerender(
      <SurfaceOwnedImageSlot role="primary" image={{ imageUrl: "https://example.test/one.png" }} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([
    ["top-left", "left top"],
    ["top-center", "center top"],
    ["top-right", "right top"],
    ["center-left", "left center"],
    ["center", "center center"],
    ["center-right", "right center"],
    ["bottom-left", "left bottom"],
    ["bottom-center", "center bottom"],
    ["bottom-right", "right bottom"],
  ] as const)("maps %s through the shared image-position seam", (imagePosition, expected) => {
    render(
      <SurfaceOwnedImageSlot
        role="tertiary"
        image={{ imageUrl: "https://example.test/positioned.png", imagePosition }}
      />,
    );

    expect(screen.getByAltText<HTMLImageElement>("").style.objectPosition).toBe(expected);
  });
});

describe("resolveSurfaceImagePick", () => {
  it.each([
    [
      { source: "url" as const, mediaType: "image" as const, url: "https://example.test/url.png" },
      "https://example.test/url.png",
    ],
    [
      {
        source: "upload" as const,
        mediaType: "image" as const,
        upload: {
          id: "upload-a",
          url: "https://example.test/upload.png",
          mediaType: "image" as const,
          fileName: "upload.png",
          mimeType: "image/png",
          size: 1024,
        },
      },
      "https://example.test/upload.png",
    ],
    [
      {
        source: "browse" as const,
        mediaType: "image" as const,
        browse: {
          id: "asset-a",
          url: "https://example.test/browse.png",
          mediaType: "image" as const,
          fileName: "browse.png",
          mimeType: "image/png",
          size: 2048,
        },
      },
      "https://example.test/browse.png",
    ],
  ])("normalises each picker source to asset-only image data", (result, imageUrl) => {
    expect(resolveSurfaceImagePick({ ...result, alt: "Description" })).toEqual({
      imageUrl,
      imageAlt: "Description",
    });
  });

  it("returns null without an asset URL and never carries a stale position", () => {
    expect(resolveSurfaceImagePick({ source: "url", mediaType: "image" })).toBeNull();
    const staleResult = {
      source: "url" as const,
      mediaType: "image" as const,
      url: "https://example.test/replacement.png",
      imagePosition: "top-left",
    };

    expect(resolveSurfaceImagePick(staleResult)).toEqual({
      imageUrl: "https://example.test/replacement.png",
    });
  });

  it("rejects non-image picker results", () => {
    expect(
      resolveSurfaceImagePick({
        source: "url",
        mediaType: "video",
        url: "https://example.test/video.mp4",
      }),
    ).toBeNull();
  });
});
