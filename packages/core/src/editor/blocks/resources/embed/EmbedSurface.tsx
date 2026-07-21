import type { EmbedAspectRatio, EmbedData } from "@scaffold/contracts";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import {
  DEFAULT_EMBED_SANDBOX,
  getEmbedProvider,
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
  const aspectStyle = { aspectRatio: ASPECT_RATIO_STYLES[data.aspectRatio] };

  return (
    <figure {...figureAttributes} className={cn("sc-embed__figure", figureAttributes?.className)}>
      {data.url && embedUrl ? (
        <div className="sc-embed__frame" style={aspectStyle}>
          <iframe
            src={embedUrl}
            title={`${provider.title} embed`}
            loading="lazy"
            allow={provider.allow}
            sandbox={provider.sandbox ?? DEFAULT_EMBED_SANDBOX}
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="sc-embed__iframe"
          />
          {editable ? (
            <div
              aria-hidden
              className="sc-embed__edit-overlay"
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

      {data.caption ? <figcaption className="sc-embed__caption">{data.caption}</figcaption> : null}
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
      className={cn("sc-embed__empty sc-embed__state", hasSource && "sc-embed__state--error")}
    >
      <span className="sc-embed__empty-chip" aria-hidden>
        <Icon size={20} weight="regular" />
      </span>
      <div className="sc-embed__empty-text">
        <p className="sc-embed__empty-title">{provider.title} embed</p>
        <p className="sc-embed__empty-hint">{message}</p>
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
    <div className={cn("sc-embed__empty")}>
      <span className="sc-embed__empty-chip" aria-hidden>
        <Icon size={20} weight="regular" />
      </span>
      <div className="sc-embed__empty-text">
        <p className="sc-embed__empty-title">{provider.title} embed</p>
        <p className="sc-embed__empty-hint">
          Paste a {provider.title.toLowerCase()} URL to embed it inline.
        </p>
      </div>
      {disabled ? null : (
        <form
          className="sc-embed__empty-form"
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
            className="sc-embed__empty-input"
            autoFocus
          />
          <button type="submit" className="sc-embed__empty-submit">
            Embed
          </button>
        </form>
      )}
    </div>
  );
}
