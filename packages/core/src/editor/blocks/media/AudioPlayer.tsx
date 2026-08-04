import {
  PauseIcon as Pause,
  PlayIcon as Play,
  SpeakerHighIcon as SpeakerHigh,
  SpeakerSlashIcon as SpeakerSlash,
} from "@phosphor-icons/react";
import { Button, IconButton, Slider } from "@radix-ui/themes";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from "react";

import "./AudioPlayer.css";

/** Course-owned controls over a hidden native audio media engine. */

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
  /** Called after the native media element confirms playback started. */
  onStarted?: () => void;
  /** Called when the native media element reports playback reached the end. */
  onEnded?: () => void;
}

export function AudioPlayer({
  src,
  title,
  onStarted,
  onEnded,
}: AudioPlayerProps) {
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
    const onPlay = () => {
      setPlaying(true);
      onStarted?.();
    };
    const onPause = () => setPlaying(false);
    const handleEnded = () => {
      setPlaying(false);
      onEnded?.();
    };
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
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("volumechange", onVolume);
    audio.addEventListener("ratechange", onRate);

    // Cached metadata can be ready before effects attach after Edit/Preview remounts.
    setPlaying(!audio.paused);
    onTime();
    onMeta();
    onVolume();
    onRate();

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("volumechange", onVolume);
      audio.removeEventListener("ratechange", onRate);
    };
  }, [onEnded, onStarted, src]);

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
      className="sc-course-audio-player"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : "Audio player"}
      onClick={(event) => event.stopPropagation()}
    >
      {/* Hidden native element for codec support + a11y fallback. */}
      <audio ref={audioRef} src={src} preload="metadata" />

      {title ? (
        <div id={titleId} className="sc-course-audio-player__title">
          {title}
        </div>
      ) : null}

      <div
        role="group"
        aria-label={title ? `${title} controls` : "Audio player controls"}
        className="sc-course-audio-player__bar"
      >
        <IconButton
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="sc-course-audio-player__play"
          radius="full"
          size="2"
          variant="solid"
        >
          {playing ? (
            <Pause size={14} weight="fill" aria-hidden />
          ) : (
            <Play size={14} weight="fill" aria-hidden />
          )}
        </IconButton>

        <AccessibleAudioSlider
          min={0}
          max={duration || 0}
          step={1}
          value={duration > 0 ? [Math.min(currentTime, duration)] : []}
          label="Seek"
          valueText={seekValueText}
          onValueChange={(next) => onSeek(next[0] ?? 0)}
          className="sc-course-audio-player__progress"
        />

        <span className="sc-course-audio-player__time">
          {formatTime(currentTime)}
          <span aria-hidden> / </span>
          {formatTime(duration)}
        </span>

        <Button
          type="button"
          onClick={cycleRate}
          aria-label={`Playback speed, ${rate}x`}
          className="sc-course-audio-player__rate"
          radius="full"
          size="1"
          variant="ghost"
        >
          {rate}x
        </Button>

        <div className="sc-course-audio-player__volume-group">
          <IconButton
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="sc-course-audio-player__mute"
            radius="full"
            size="1"
            variant="ghost"
          >
            {muted || volume === 0 ? (
              <SpeakerSlash size={14} weight="regular" aria-hidden />
            ) : (
              <SpeakerHigh size={14} weight="regular" aria-hidden />
            )}
          </IconButton>

          <AccessibleAudioSlider
            min={0}
            max={1}
            step={0.05}
            value={[effectiveVolume]}
            label="Volume"
            valueText={volumeValueText}
            onValueChange={(next) => onVolumeChange(next[0] ?? 0)}
            className="sc-course-audio-player__volume"
          />
        </div>
      </div>
    </div>
  );
}

interface AccessibleAudioSliderProps
  extends Omit<ComponentPropsWithoutRef<typeof Slider>, "aria-label" | "aria-valuetext"> {
  label: string;
  valueText: string;
}

function AccessibleAudioSlider({ label, valueText, ...props }: AccessibleAudioSliderProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    const thumb = rootRef.current?.querySelector<HTMLElement>('[role="slider"]');
    if (!thumb) return;
    thumb.setAttribute("aria-label", label);
    thumb.setAttribute("aria-valuetext", valueText);
  }, [label, valueText]);

  return <Slider {...props} ref={rootRef} />;
}
