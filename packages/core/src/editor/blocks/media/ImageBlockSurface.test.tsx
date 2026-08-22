// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ImageBlockSurface } from "./ImageBlockSurface";

afterEach(cleanup);

describe("ImageBlockSurface ownership", () => {
  it.each([
    {
      expected: "missing",
      props: { data: null, errorMessage: null, resolvedUrl: null },
    },
    {
      expected: "loading",
      props: {
        data: { mode: "managed" as const, mediaId: "image-1" },
        errorMessage: null,
        resolvedUrl: null,
      },
    },
    {
      expected: "error",
      props: {
        data: { mode: "managed" as const, mediaId: "image-1" },
        errorMessage: "Image unavailable",
        resolvedUrl: null,
      },
    },
    {
      expected: "ready",
      props: {
        data: { mode: "external" as const, src: "https://example.com/image.jpg" },
        errorMessage: null,
        resolvedUrl: "https://example.com/image.jpg",
      },
    },
  ])("projects the $expected state onto the shared Course stage", ({ expected, props }) => {
    const { container } = render(<ImageBlockSurface {...props} />);

    expect(container.querySelector(".sc-course-image-block__stage")).toHaveAttribute(
      "data-image-state",
      expected,
    );
  });

  it("uses Course presentation classes without an authoring host at runtime", () => {
    const { container } = render(
      <ImageBlockSurface
        data={{ mode: "external", src: "https://example.com/image.jpg", alt: "Example" }}
        errorMessage={null}
        resolvedUrl="https://example.com/image.jpg"
      />,
    );

    const stage = container.querySelector(".sc-course-image-block__stage");
    expect(stage).not.toBeNull();
    expect(stage).not.toHaveClass("sc-app-media-replace-host");
    expect(stage?.querySelector("img")).toHaveClass("sc-course-image-block__media");
  });

  it("adds the App replace-host hook only when a replace action exists", () => {
    const { container } = render(
      <ImageBlockSurface
        data={{ mode: "external", src: "https://example.com/image.jpg", alt: "Example" }}
        errorMessage={null}
        resolvedUrl="https://example.com/image.jpg"
        replaceAction={<button type="button">Replace image</button>}
      />,
    );

    expect(container.querySelector(".sc-course-image-block__stage")).toHaveClass(
      "sc-app-media-replace-host",
    );
  });
});
