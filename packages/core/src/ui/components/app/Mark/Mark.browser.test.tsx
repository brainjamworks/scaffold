import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";

import { Wordmark } from "./Mark";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Wordmark", () => {
  it("uses App-owned classes inside the fixed App theme boundary", () => {
    const { container } = render(
      <AppThemeProvider appearance="light">
        <main>
          <Wordmark />
        </main>
      </AppThemeProvider>,
    );
    const wordmark = container.querySelector<HTMLElement>("[data-scaffold-wordmark]");
    const mark = container.querySelector<HTMLElement>("[aria-label='scaffold mark']");

    expect(wordmark?.closest(".sc-app")).toBe(container.firstElementChild);
    expect(wordmark?.classList.contains("sc-app-wordmark")).toBe(true);
    expect(mark?.classList.contains("sc-app-mark")).toBe(true);
  });

  it("uses the brand font independently from the application font", () => {
    const { container } = render(<Wordmark />);
    const type = container.querySelector<HTMLElement>("[data-scaffold-wordmark] > span:last-child");

    expect(type).not.toBeNull();
    expect(getComputedStyle(type!).fontFamily).toContain("Poppins");
    expect(getComputedStyle(document.body).fontFamily).toContain("Satoshi");
  });
});
