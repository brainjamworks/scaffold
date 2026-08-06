import type { EmbedAspectRatio, EmbedData } from "@scaffold/contracts";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import {
  DEFAULT_EMBED_SANDBOX,
  getEmbedProvider,
  resolveEmbedFrame,
  resolveEmbedUrl,
  type EmbedProvider,
} from "./embed-registry";
import "./Embed.css";

const ASPECT_RATIO_STYLES: Record<EmbedAspectRatio, string> = {
  "16/9": "16 / 9",
  "4/3": "4 / 3",
  "1/1": "1 / 1",
  "9/16": "9 / 16",
};

export function EmbedSurface({
  data,
  editable,
  figureAttributes,
  onSubmit,
}: {
  data: EmbedData;
  editable: boolean;
  figureAttributes?: HTMLAttributes<HTMLElement>;
  onSubmit?: (url: string) => void;
}) {
  const provider = getEmbedProvider(data.provider) ?? getEmbedProvider("generic")!;
  const embedUrl = data.url ? resolveEmbedUrl(data.provider, data.url) : null;
  const frame = resolveEmbedFrame(data);
  const frameStyle =
    frame.kind === "fixed-height"
      ? undefined
      : { aspectRatio: ASPECT_RATIO_STYLES[frame.aspectRatio] };
  const iframeStyle = frame.kind === "fixed-height" ? { height: `${frame.height}px` } : undefined;
  const accessibleName = data.caption.trim() || `${provider.title} embed`;

  return (
    <figure
      {...figureAttributes}
      className={cn("sc-course-embed__figure", figureAttributes?.className)}
    >
      {data.url && embedUrl ? (
        <div
          className="sc-course-embed__frame"
          data-embed-provider={provider.id}
          data-embed-frame={frame.kind}
          style={frameStyle}
        >
          <iframe
            src={embedUrl}
            title={accessibleName}
            loading="lazy"
            allow={provider.allow}
            sandbox={provider.sandbox ?? DEFAULT_EMBED_SANDBOX}
            referrerPolicy="strict-origin-when-cross-origin"
            className="sc-course-embed__iframe"
            style={iframeStyle}
          />
          {editable ? (
            <div
              aria-hidden
              className="sc-app-embed__interaction-guard"
              title="Click outside to interact with the embed"
            />
          ) : null}
        </div>
      ) : editable ? (
        <EmbedEmptyState
          provider={provider}
          disabled={!editable || !onSubmit}
          initialUrl={data.url}
          {...(onSubmit ? { onSubmit } : {})}
        />
      ) : (
        <EmbedRuntimeState provider={provider} hasSource={Boolean(data.url)} />
      )}

      {data.caption ? (
        <figcaption className="sc-course-embed__caption">{data.caption}</figcaption>
      ) : null}
    </figure>
  );
}

function EmbedRuntimeState({
  hasSource,
  provider,
}: {
  hasSource: boolean;
  provider: EmbedProvider;
}) {
  const Icon = provider.icon;
  const role = hasSource ? "alert" : "status";
  const message = hasSource ? "Embed unavailable" : "No embed";

  return (
    <div
      role={role}
      className={cn(
        "sc-course-embed__empty sc-course-embed__state",
        hasSource && "sc-course-embed__state--error",
      )}
      {...(hasSource ? { "data-course-state": "error" as const } : {})}
    >
      <span className="sc-course-embed__empty-chip" aria-hidden>
        <Icon size={20} weight="regular" />
      </span>
      <div className="sc-course-embed__empty-text">
        <p className="sc-course-embed__empty-title">{provider.title} embed</p>
        <p className="sc-course-embed__empty-hint">{message}</p>
      </div>
    </div>
  );
}

function EmbedEmptyState({
  provider,
  disabled,
  initialUrl,
  onSubmit,
}: {
  provider: EmbedProvider;
  disabled: boolean;
  initialUrl: string;
  onSubmit?: (url: string) => void;
}) {
  const Icon = provider.icon;
  return (
    <div className="sc-course-embed__empty">
      <span className="sc-course-embed__empty-chip" aria-hidden>
        <Icon size={20} weight="regular" />
      </span>
      <div className="sc-course-embed__empty-text">
        <p className="sc-course-embed__empty-title">{provider.title} embed</p>
        <p className="sc-course-embed__empty-hint">
          {provider.id === "generic"
            ? "Paste a supported URL to embed it inline."
            : `Paste a ${provider.title} URL to embed it inline.`}
        </p>
      </div>
      {disabled ? null : (
        <form
          className="sc-app-embed__form"
          contentEditable={false}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem("url") as HTMLInputElement | null;
            if (input && onSubmit) onSubmit(input.value);
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <input
            type="text"
            inputMode="url"
            name="url"
            defaultValue={initialUrl}
            placeholder="https://..."
            aria-label="Embed URL"
            className="sc-app-embed__input"
          />
          <button type="submit" className="sc-app-embed__submit">
            Embed
          </button>
        </form>
      )}
    </div>
  );
}
