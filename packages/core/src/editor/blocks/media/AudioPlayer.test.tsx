// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { AudioPlayer } from "./AudioPlayer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("reports confirmed native playback start and end events", () => {
  const onStarted = vi.fn();
  const onEnded = vi.fn();
  render(
    <AudioPlayer
      src="https://example.com/private-audio.mp3?token=SECRET"
      onStarted={onStarted}
      onEnded={onEnded}
    />,
  );
  const audio = screen.getByLabelText("Audio player").querySelector("audio");
  expect(audio).not.toBeNull();
  if (!audio) return;

  fireEvent.play(audio);
  expect(onStarted).toHaveBeenCalledOnce();
  expect(onEnded).not.toHaveBeenCalled();

  fireEvent.ended(audio);
  expect(onEnded).toHaveBeenCalledOnce();
});

it("does not report pause, seek, volume, or playback-rate changes as learning events", () => {
  const onStarted = vi.fn();
  const onEnded = vi.fn();
  render(
    <AudioPlayer src="https://example.com/audio.mp3" onStarted={onStarted} onEnded={onEnded} />,
  );
  const audio = screen.getByLabelText("Audio player").querySelector("audio");
  expect(audio).not.toBeNull();
  if (!audio) return;

  fireEvent.pause(audio);
  fireEvent.timeUpdate(audio);
  fireEvent.volumeChange(audio);
  fireEvent.rateChange(audio);

  expect(onStarted).not.toHaveBeenCalled();
  expect(onEnded).not.toHaveBeenCalled();
});

it("composes Radix controls while preserving slider names and value text", () => {
  vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(95);
  render(<AudioPlayer src="https://example.com/audio.mp3" />);

  expect(screen.getByRole("button", { name: "Play" })).toHaveClass("rt-IconButton");
  expect(screen.getByRole("button", { name: "Mute" })).toHaveClass("rt-IconButton");
  expect(screen.getByRole("button", { name: "Playback speed, 1x" })).toHaveClass("rt-Button");

  const seek = screen.getByRole("slider", { name: "Seek" });
  const volume = screen.getByRole("slider", { name: "Volume" });
  expect(seek).toHaveAttribute("aria-valuetext", "0 seconds of 1 minute 35 seconds");
  expect(volume).toHaveAttribute("aria-valuetext", "100%");
  expect(seek.closest(".rt-SliderRoot")).toHaveClass("sc-course-audio-player__progress");
  expect(volume.closest(".rt-SliderRoot")).toHaveClass("sc-course-audio-player__volume");
});

it("synchronizes metadata that loaded before effects after a view remount", () => {
  vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(125);

  render(<AudioPlayer src="https://example.com/cached-audio.mp3" />);

  expect(screen.getByRole("slider", { name: "Seek" })).toHaveAttribute(
    "aria-valuetext",
    "0 seconds of 2 minutes 5 seconds",
  );
});

it("does not expose a seek thumb before media metadata is available", () => {
  const { container } = render(<AudioPlayer src="https://example.com/loading-audio.mp3" />);

  const seek = container.querySelector(".sc-course-audio-player__progress");
  expect(seek).not.toBeNull();
  expect(seek?.querySelector('[role="slider"]')).toBeNull();
});
