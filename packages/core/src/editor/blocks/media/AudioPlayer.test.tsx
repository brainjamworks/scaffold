// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { AudioPlayer } from "./AudioPlayer";

afterEach(cleanup);

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
