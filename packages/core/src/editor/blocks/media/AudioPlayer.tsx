import {
  PauseIcon as Pause,
  PlayIcon as Play,
  SpeakerHighIcon as SpeakerHigh,
  SpeakerSlashIcon as SpeakerSlash,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from "react";

import { cn } from "@/lib/cn";

import "./AudioPlayer.css";

/**
 * AudioPlayer — scaffold audio control bar.
 *
 * Custom controls over a hidden native `<audio>` element. Pill-
 * shaped chrome with play/pause, progress, time, speed cycle, mute,
 * and volume. Designed for use inside the AudioBlock NodeView but
 * exportable for other contexts (e.g. assessment choices) later.
 *
 * Accessibility: every interactive element has an aria-label, range
 * inputs announce position via aria-valuetext, controls meet the
 * 44px touch-target rule, transitions disabled under reduced-motion.
 */

const PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function spokenTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0 seconds";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  parts.push(`${s} ${s === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
}

interface AudioPlayerProps {
  /** Audio source URL. */
  src: string;
  /** Visible / accessible title. */
  title?: string;
  /** Optional extra className for the outer wrapper. */
  className?: string;
  /** Inline style passthrough (rare; used by the block to align). */
  style?: CSSProperties;
}

export function AudioPlayer({ src, title, className, style }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const titleId = useId();

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);

  /* Wire audio element events to React state. */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onVolume = () => {
      setMuted(audio.muted);
      setVolume(audio.volume);
    };
    const onRate = () => {
      const next = PLAYBACK_RATES.find((r) => Math.abs(r - audio.playbackRate) < 0.01);
      if (next !== undefined) setRate(next);
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("volumechange", onVolume);
    audio.addEventListener("ratechange", onRate);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("volumechange", onVolume);
      audio.removeEventListener("ratechange", onRate);
    };
  }, [src]);

  const togglePlay = (event: MouseEvent) => {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };

  const cycleRate = (event: MouseEvent) => {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    const idx = PLAYBACK_RATES.indexOf(rate);
    const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length] ?? 1;
    audio.playbackRate = next;
  };

  const toggleMute = (event: MouseEvent) => {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
  };

  const onSeek = (next: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const onVolumeChange = (next: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = next;
    if (next > 0 && audio.muted) audio.muted = false;
  };

  const seekValueText = `${spokenTime(currentTime)} of ${spokenTime(duration)}`;
  const volumeValueText = `${Math.round(volume * 100)}%`;
  const effectiveVolume = muted ? 0 : volume;

  return (
    <div
      className={cn("sc-audio-player", className)}
      style={style}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : "Audio player"}
      onClick={(event) => event.stopPropagation()}
    >
      {/* Hidden native element for codec support + a11y fallback. */}
      <audio ref={audioRef} src={src} preload="metadata" />

      {title ? (
        <div id={titleId} className="sc-audio-player__title">
          {title}
        </div>
      ) : null}

      <div
        role="group"
        aria-label={title ? `${title} controls` : "Audio player controls"}
        className="sc-audio-player__bar"
      >
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="sc-audio-player__play"
        >
          {playing ? (
            <Pause size={14} weight="fill" aria-hidden />
          ) : (
            <Play size={14} weight="fill" aria-hidden />
          )}
        </button>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={Math.min(currentTime, duration || 0)}
          aria-label="Seek"
          aria-valuetext={seekValueText}
          onChange={(e) => onSeek(Number(e.currentTarget.value))}
          className="sc-audio-player__progress"
        />

        <span className="sc-audio-player__time">
          {formatTime(currentTime)}
          <span aria-hidden> / </span>
          {formatTime(duration)}
        </span>

        <button
          type="button"
          onClick={cycleRate}
          aria-label={`Playback speed, ${rate}x`}
          className="sc-audio-player__rate"
        >
          {rate}x
        </button>

        <div className="sc-audio-player__volume-group">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="sc-audio-player__mute"
          >
            {muted || volume === 0 ? (
              <SpeakerSlash size={14} weight="regular" aria-hidden />
            ) : (
              <SpeakerHigh size={14} weight="regular" aria-hidden />
            )}
          </button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={effectiveVolume}
            aria-label="Volume"
            aria-valuetext={volumeValueText}
            onChange={(e) => onVolumeChange(Number(e.currentTarget.value))}
            className="sc-audio-player__volume"
          />
        </div>
      </div>
    </div>
  );
}
