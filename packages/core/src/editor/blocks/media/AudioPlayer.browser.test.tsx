import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import { AudioPlayer } from "./AudioPlayer";
import "./AudioPlayer.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Audio Player responsive controls", () => {
  it("keeps essential controls available while progressively reducing secondary chrome", async () => {
    const { host, player } = await mountAudioPlayer();
    const play = requiredElement<HTMLElement>(player, ".sc-audio-player__play");
    const progress = requiredElement<HTMLElement>(player, ".sc-audio-player__progress");
    const volume = requiredElement<HTMLElement>(player, ".sc-audio-player__volume");
    const rate = requiredElement<HTMLElement>(player, ".sc-audio-player__rate");
    const time = requiredElement<HTMLElement>(player, ".sc-audio-player__time");

    expect(getComputedStyle(player).containerName).toBe("sc-audio-player");
    expect(isVisible(play)).toBe(true);
    expect(isVisible(progress)).toBe(true);
    expect(isVisible(volume)).toBe(true);
    expect(isVisible(rate)).toBe(true);
    expect(isVisible(time)).toBe(true);

    host.style.width = "400px";
    await waitForCondition(() => !isVisible(volume));
    expect(isVisible(rate)).toBe(true);
    expect(isVisible(time)).toBe(true);

    host.style.width = "300px";
    await waitForCondition(() => !isVisible(rate));
    expect(isVisible(time)).toBe(true);

    host.style.width = "240px";
    await waitForCondition(() => !isVisible(time));
    expect(isVisible(play)).toBe(true);
    expect(isVisible(progress)).toBe(true);
  });

  it("preserves mute and playback-rate interactions", async () => {
    const { player } = await mountAudioPlayer();
    const mute = requiredElement<HTMLButtonElement>(player, ".sc-audio-player__mute");
    const rate = requiredElement<HTMLButtonElement>(player, ".sc-audio-player__rate");

    expect(mute.getAttribute("aria-label")).toBe("Mute");
    mute.click();
    await waitForCondition(() => mute.getAttribute("aria-label") === "Unmute");
    mute.click();
    await waitForCondition(() => mute.getAttribute("aria-label") === "Mute");

    expect(rate.getAttribute("aria-label")).toBe("Playback speed, 1x");
    rate.click();
    await waitForCondition(() => rate.getAttribute("aria-label") === "Playback speed, 1.5x");
    rate.click();
    await waitForCondition(() => rate.getAttribute("aria-label") === "Playback speed, 2x");
    rate.click();
    await waitForCondition(() => rate.getAttribute("aria-label") === "Playback speed, 0.5x");
    rate.click();
    await waitForCondition(() => rate.getAttribute("aria-label") === "Playback speed, 1x");
  });
});

async function mountAudioPlayer() {
  const host = document.createElement("div");
  host.style.width = "480px";
  document.body.append(host);

  const root = createRoot(host);
  mountedRoots.push(root);
  root.render(<AudioPlayer src="data:audio/wav;base64," title="Browser test audio" />);

  await waitForCondition(() => host.querySelector(".sc-audio-player"));
  return {
    host,
    player: requiredElement<HTMLElement>(host, ".sc-audio-player"),
  };
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return getComputedStyle(element).display !== "none" && rect.width > 0 && rect.height > 0;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Audio Player state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
