// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { expect, it, vi } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";
import "./text-wrap-image-definition";
import { emptyTextWrapImageData } from "./content";
import { TextWrapImageMediaSurface } from "./TextWrapImageSurface";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "text_wrap_image",
  catalogId: "text-wrap-image",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

it("renders wrapped image alt text and replace action semantics", async () => {
  const user = userEvent.setup();
  const replace = vi.fn();

  render(
    createElement(TextWrapImageMediaSurface, {
      data: emptyTextWrapImageData({
        source: {
          mode: "external",
          src: "https://example.com/wrapped.jpg",
        },
        alt: "Course pathway diagram",
      }),
      fileUrl: "https://example.com/wrapped.jpg",
      replaceAction: createElement("button", { onClick: replace }, "Replace wrapped image"),
    }),
  );

  expect(screen.getByRole("img", { name: "Course pathway diagram" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Replace wrapped image" }));

  expect(replace).toHaveBeenCalledTimes(1);
});

it("keeps wrapped image missing, loading, and error states semantic", () => {
  const { rerender } = render(
    createElement(TextWrapImageMediaSurface, {
      data: emptyTextWrapImageData(),
      fileUrl: null,
    }),
  );

  expect(screen.getByRole("status").textContent).toBe("No image");
  expect(screen.queryByRole("img")).toBeNull();

  rerender(
    createElement(TextWrapImageMediaSurface, {
      data: emptyTextWrapImageData({
        source: {
          mode: "managed",
          mediaId: "wrapped-image",
        },
      }),
      fileUrl: null,
    }),
  );

  expect(screen.getByRole("status").textContent).toBe("Loading image...");

  rerender(
    createElement(TextWrapImageMediaSurface, {
      data: emptyTextWrapImageData({
        source: {
          mode: "managed",
          mediaId: "wrapped-image",
        },
      }),
      errorMessage: "Wrapped image unavailable",
      fileUrl: null,
    }),
  );

  expect(screen.getByRole("alert").textContent).toBe("Wrapped image unavailable");
});

it("uses an action instead of a status for empty editable wrapped images", async () => {
  const user = userEvent.setup();
  const add = vi.fn();

  render(
    createElement(TextWrapImageMediaSurface, {
      data: emptyTextWrapImageData(),
      emptyAction: createElement("button", { onClick: add }, "Add wrapped image"),
      fileUrl: null,
    }),
  );

  await user.click(screen.getByRole("button", { name: "Add wrapped image" }));

  expect(add).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("status")).toBeNull();
});
