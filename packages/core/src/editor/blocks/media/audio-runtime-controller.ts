export type AudioPlaybackStatus = "idle" | "playing" | "paused" | "ended";

export type AudioPlaybackOrigin = "learner" | "control-command" | "reconciliation";

export interface AudioPlaybackCommit {
  readonly type: "played" | "paused" | "ended";
  readonly origin: AudioPlaybackOrigin;
}

export type AudioCommandOutcome =
  | { readonly kind: "success" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "playback-not-allowed" }
  | { readonly kind: "media-unavailable"; readonly mediaErrorCode: number | null }
  | {
      readonly kind: "seek-out-of-range";
      readonly requestedSeconds: number;
      readonly durationSeconds: number;
    };

type CommitListener = (commit: AudioPlaybackCommit) => void;

interface PendingConfirmation {
  readonly kind: "play" | "pause" | "metadata" | "seek";
  readonly origin: AudioPlaybackOrigin;
  readonly resolve: (outcome: AudioCommandOutcome) => void;
  readonly reject: (error: unknown) => void;
  readonly requestedSeconds?: number;
  readonly signal: AbortSignal;
  readonly handleAbort: () => void;
}

export interface AudioRuntimeController {
  readonly attach: (audio: HTMLAudioElement, sourceKey: string) => () => void;
  readonly getStatus: () => AudioPlaybackStatus;
  readonly isMounted: () => boolean;
  readonly pause: (
    origin: AudioPlaybackOrigin,
    signal: AbortSignal,
  ) => Promise<AudioCommandOutcome>;
  readonly play: (origin: AudioPlaybackOrigin, signal: AbortSignal) => Promise<AudioCommandOutcome>;
  readonly seekTo: (
    seconds: number,
    origin: AudioPlaybackOrigin,
    signal: AbortSignal,
  ) => Promise<AudioCommandOutcome>;
  readonly subscribeToCommits: (listener: CommitListener) => () => void;
}

const SUCCESS = Object.freeze({ kind: "success" as const });
const CANCELLED = Object.freeze({ kind: "cancelled" as const });

export function createAudioRuntimeController(): AudioRuntimeController {
  let audio: HTMLAudioElement | null = null;
  let sourceKey: string | null = null;
  let status: AudioPlaybackStatus = "idle";
  let playbackOrigin: AudioPlaybackOrigin = "reconciliation";
  let pending: PendingConfirmation | null = null;
  const listeners = new Set<CommitListener>();

  const closePending = (outcome: AudioCommandOutcome) => {
    const closing = pending;
    if (!closing) return;
    pending = null;
    closing.signal.removeEventListener("abort", closing.handleAbort);
    closing.resolve(outcome);
  };
  const failPending = (error: unknown) => {
    const failing = pending;
    if (!failing) throw error;
    pending = null;
    failing.signal.removeEventListener("abort", failing.handleAbort);
    failing.reject(error);
  };
  const publish = (commit: AudioPlaybackCommit) => {
    let firstDefect: unknown;
    for (const listener of [...listeners]) {
      try {
        listener(commit);
      } catch (error) {
        firstDefect ??= error;
      }
    }
    if (firstDefect !== undefined) throw firstDefect;
  };
  const handlePlay = () => {
    const origin = pending?.kind === "play" ? pending.origin : "reconciliation";
    status = "playing";
    playbackOrigin = origin;
    if (pending?.kind === "play") closePending(SUCCESS);
    publish(Object.freeze({ type: "played", origin }));
  };
  const handlePause = () => {
    const origin = pending?.kind === "pause" ? pending.origin : "reconciliation";
    status = status === "idle" ? "idle" : "paused";
    if (pending?.kind === "pause") closePending(SUCCESS);
    publish(Object.freeze({ type: "paused", origin }));
  };
  const handleEnded = () => {
    status = "ended";
    publish(Object.freeze({ type: "ended", origin: playbackOrigin }));
  };
  const handleMetadata = () => {
    if (pending?.kind === "metadata" && hasUsableDuration(requireAudio())) {
      closePending(SUCCESS);
    }
  };
  const handleSeeked = () => {
    if (pending?.kind !== "seek") return;
    const current = requireAudio();
    const requestedSeconds = pending.requestedSeconds;
    if (requestedSeconds === undefined || Math.abs(current.currentTime - requestedSeconds) > 0.05) {
      failPending(new Error("Audio native authority confirmed a contradictory seek position."));
      return;
    }
    closePending(SUCCESS);
  };
  const handleError = () => {
    if (!pending) return;
    const current = requireAudio();
    closePending(
      Object.freeze({ kind: "media-unavailable", mediaErrorCode: current.error?.code ?? null }),
    );
  };
  const requireAudio = () => {
    if (!audio) throw new Error("Audio runtime authority is not mounted.");
    return audio;
  };
  const waitForConfirmation = (
    kind: PendingConfirmation["kind"],
    origin: AudioPlaybackOrigin,
    signal: AbortSignal,
    requestedSeconds?: number,
  ) => {
    if (signal.aborted) return Promise.resolve<AudioCommandOutcome>(CANCELLED);
    closePending(CANCELLED);
    return new Promise<AudioCommandOutcome>((resolve, reject) => {
      const handleAbort = () => {
        if (pending?.resolve !== resolve) return;
        closePending(CANCELLED);
      };
      pending = {
        kind,
        origin,
        resolve,
        reject,
        signal,
        handleAbort,
        ...(requestedSeconds === undefined ? {} : { requestedSeconds }),
      };
      signal.addEventListener("abort", handleAbort, { once: true });
      if (signal.aborted) handleAbort();
    });
  };

  const controller: AudioRuntimeController = {
    attach(nextAudio, nextSourceKey) {
      if (audio) throw new Error("Audio runtime authority is already mounted.");
      audio = nextAudio;
      sourceKey = nextSourceKey;
      status = nextAudio.ended ? "ended" : nextAudio.paused ? "idle" : "playing";
      playbackOrigin = "reconciliation";
      nextAudio.addEventListener("play", handlePlay);
      nextAudio.addEventListener("pause", handlePause);
      nextAudio.addEventListener("ended", handleEnded);
      nextAudio.addEventListener("loadedmetadata", handleMetadata);
      nextAudio.addEventListener("durationchange", handleMetadata);
      nextAudio.addEventListener("seeked", handleSeeked);
      nextAudio.addEventListener("error", handleError);
      let attached = true;
      return () => {
        if (!attached) return;
        attached = false;
        nextAudio.removeEventListener("play", handlePlay);
        nextAudio.removeEventListener("pause", handlePause);
        nextAudio.removeEventListener("ended", handleEnded);
        nextAudio.removeEventListener("loadedmetadata", handleMetadata);
        nextAudio.removeEventListener("durationchange", handleMetadata);
        nextAudio.removeEventListener("seeked", handleSeeked);
        nextAudio.removeEventListener("error", handleError);
        if (audio !== nextAudio || sourceKey !== nextSourceKey) return;
        audio = null;
        sourceKey = null;
        status = "idle";
        closePending(Object.freeze({ kind: "media-unavailable", mediaErrorCode: null }));
      };
    },
    getStatus: () => status,
    isMounted: () => audio !== null,
    async pause(origin, signal) {
      const current = requireAudio();
      if (status !== "playing" || current.paused) return SUCCESS;
      const confirmation = waitForConfirmation("pause", origin, signal);
      if (signal.aborted) return confirmation;
      current.pause();
      return confirmation;
    },
    async play(origin, signal) {
      const current = requireAudio();
      if (status === "playing" && !current.paused) return SUCCESS;
      const confirmation = waitForConfirmation("play", origin, signal);
      if (signal.aborted) return confirmation;
      try {
        void current.play().catch((error: unknown) => {
          if (pending?.kind !== "play") return;
          try {
            closePending(classifyPlayFailure(current, error));
          } catch (defect) {
            failPending(defect);
          }
        });
      } catch (error) {
        try {
          closePending(classifyPlayFailure(current, error));
        } catch (defect) {
          failPending(defect);
        }
      }
      return confirmation;
    },
    async seekTo(seconds, origin, signal) {
      let current = requireAudio();
      if (signal.aborted) return CANCELLED;
      if (!hasUsableDuration(current)) {
        const metadata = await waitForConfirmation("metadata", origin, signal);
        if (metadata.kind !== "success") return metadata;
        current = requireAudio();
      }
      const durationSeconds = current.duration;
      if (seconds > durationSeconds) {
        return Object.freeze({
          kind: "seek-out-of-range",
          requestedSeconds: seconds,
          durationSeconds,
        });
      }
      if (Math.abs(current.currentTime - seconds) <= 0.05) return SUCCESS;
      const confirmation = waitForConfirmation("seek", origin, signal, seconds);
      if (signal.aborted) return confirmation;
      current.currentTime = seconds;
      return confirmation;
    },
    subscribeToCommits(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return Object.freeze(controller);
}

function hasUsableDuration(audio: HTMLAudioElement): boolean {
  return Number.isFinite(audio.duration) && audio.duration >= 0;
}

function classifyPlayFailure(audio: HTMLAudioElement, error: unknown): AudioCommandOutcome {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return Object.freeze({ kind: "playback-not-allowed" });
  }
  if (error instanceof DOMException && ["AbortError", "NotSupportedError"].includes(error.name)) {
    return Object.freeze({ kind: "media-unavailable", mediaErrorCode: audio.error?.code ?? null });
  }
  throw error;
}
