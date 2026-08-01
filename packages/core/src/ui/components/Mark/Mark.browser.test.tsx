import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import { Wordmark } from "./Mark";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Wordmark", () => {
  it("uses the brand font independently from the application font", () => {
    const { container } = render(<Wordmark />);
    const type = container.querySelector<HTMLElement>("[data-scaffold-wordmark] > span:last-child");

    expect(type).not.toBeNull();
    expect(getComputedStyle(type!).fontFamily).toContain("Poppins");
    expect(getComputedStyle(document.body).fontFamily).toContain("Satoshi");
  });
});
