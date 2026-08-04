// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { AudioBlockSurface } from "./AudioBlockSurface";

afterEach(cleanup);

describe("AudioBlockSurface ownership", () => {
  it("renders only Course-owned learner presentation", () => {
    const { container } = render(
      <AudioBlockSurface
        data={{ mode: "external", src: "https://example.com/audio.mp3", title: "Example" }}
        errorMessage={null}
        resolvedUrl="https://example.com/audio.mp3"
      />,
    );

    expect(container.querySelector(".sc-course-audio-block__stage")).not.toBeNull();
    expect(container.querySelector('[class*="sc-app-"]')).toBeNull();
    expect(screen.getByRole("group", { name: "Example controls" })).toBeInTheDocument();
  });

  it("keeps the learner missing state semantic", () => {
    render(<AudioBlockSurface data={null} errorMessage={null} resolvedUrl={null} />);

    expect(screen.getByRole("status")).toHaveTextContent("No audio");
  });
});
