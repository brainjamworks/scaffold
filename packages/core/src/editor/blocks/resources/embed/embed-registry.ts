/**
 * Embed provider registry. Mirrors tldraw's pattern: each provider has
 * a list of hostnames it claims, a function that derives the embed URL
 * from a paste URL, and metadata that controls how the embed renders
 * (default aspect ratio, sandbox attributes).
 *
 * Storing the canonical user-facing URL in `data.url` and deriving the
 * embed URL at render time keeps the source authoritative: if a
 * provider changes their embed URL shape later, all existing documents
 * keep working as soon as the registry updates.
 */

import {
  ArticleIcon as Article,
  FigmaLogoIcon as FigmaLogo,
  GithubLogoIcon as GithubLogo,
  GlobeIcon as Globe,
  PencilSimpleIcon as PencilSimple,
  PlayCircleIcon as PlayCircle,
  SoundcloudLogoIcon as SoundcloudLogo,
  SpotifyLogoIcon as SpotifyLogo,
  VideoCameraIcon as VideoCamera,
  YoutubeLogoIcon as YoutubeLogo,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

export interface EmbedProvider {
  /** Stable id stored in `data.provider`. */
  id: string;
  /** Display label shown in the insert catalog and chrome. */
  title: string;
  /** Phosphor icon for the catalog entry. */
  icon: Icon;
  /** Default aspect ratio for the iframe container. */
  aspectRatio: "16/9" | "4/3" | "1/1" | "9/16";
  /** Hostnames this provider claims. */
  hostnames: readonly string[];
  /** Iframe `allow` attribute. */
  allow?: string;
  /** Iframe `sandbox` attribute. Default: standard provider sandbox. */
  sandbox?: string;
  /** Convert a user-facing URL to the embed URL. Returns null on no match. */
  toEmbedUrl: (url: string) => string | null;
  /** Reverse direction — keep canonical URLs editable after the doc is saved. */
  fromEmbedUrl?: (url: string) => string | null;
}

const COMMON_VIDEO_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";

const COMMON_AUDIO_ALLOW = "autoplay; clipboard-write; encrypted-media";

export const DEFAULT_EMBED_SANDBOX =
  "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isAllowedIframeProtocol(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Treat a bare host (`youtube.com/...`) as `https://`. Authors paste URLs
 * from address bars where the protocol is hidden; without this we'd
 * iframe a relative URL and the browser would resolve it against the
 * editor's own origin (showing the editor itself inside the embed).
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const hasExplicitScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasExplicitScheme && !/^https?:\/\//i.test(trimmed)) return "";
  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.startsWith("//")
      ? `https:${trimmed}`
      : `https://${trimmed}`;
  return isAllowedIframeProtocol(normalized) ? normalized : "";
}

function hostMatches(host: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

/**
 * Youtube. Uses youtube-nocookie.com so the embed doesn't drop cookies
 * until the user actually plays the video. Most LMSes that allow video
 * embeds allow nocookie too.
 */
const youtube: EmbedProvider = {
  id: "youtube",
  title: "YouTube",
  icon: YoutubeLogo,
  aspectRatio: "16/9",
  hostnames: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
  allow: COMMON_VIDEO_ALLOW,
  toEmbedUrl: (url) => {
    const host = hostnameOf(url);
    if (!host) return null;
    try {
      const parsed = new URL(url);
      const id =
        host === "youtu.be"
          ? (parsed.pathname.replace(/^\//, "").split("/")[0] ?? null)
          : (parsed.searchParams.get("v") ??
            parsed.pathname.match(/\/(?:embed|shorts|v|live)\/([\w-]+)/)?.[1] ??
            null);
      if (!id) return null;
      return `https://www.youtube-nocookie.com/embed/${id}`;
    } catch {
      return null;
    }
  },
  fromEmbedUrl: (url) => {
    const match = url.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/);
    return match ? `https://www.youtube.com/watch?v=${match[1]}` : null;
  },
};

const vimeo: EmbedProvider = {
  id: "vimeo",
  title: "Vimeo",
  icon: VideoCamera,
  aspectRatio: "16/9",
  hostnames: ["vimeo.com", "player.vimeo.com"],
  allow: COMMON_VIDEO_ALLOW,
  toEmbedUrl: (url) => {
    const host = hostnameOf(url);
    if (!host) return null;
    if (host === "player.vimeo.com") return url;
    try {
      const parsed = new URL(url);
      const id = parsed.pathname.match(/^\/(\d+)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    } catch {
      return null;
    }
  },
  fromEmbedUrl: (url) => {
    const match = url.match(/player\.vimeo\.com\/video\/(\d+)/);
    return match ? `https://vimeo.com/${match[1]}` : null;
  },
};

const loom: EmbedProvider = {
  id: "loom",
  title: "Loom",
  icon: PlayCircle,
  aspectRatio: "16/9",
  hostnames: ["loom.com"],
  allow: COMMON_VIDEO_ALLOW,
  toEmbedUrl: (url) => {
    const match = url.match(/loom\.com\/(?:share|embed)\/([\w-]+)/);
    return match ? `https://www.loom.com/embed/${match[1]}` : null;
  },
  fromEmbedUrl: (url) => {
    const match = url.match(/loom\.com\/embed\/([\w-]+)/);
    return match ? `https://www.loom.com/share/${match[1]}` : null;
  },
};

const spotify: EmbedProvider = {
  id: "spotify",
  title: "Spotify",
  icon: SpotifyLogo,
  aspectRatio: "16/9",
  hostnames: ["spotify.com", "open.spotify.com"],
  allow: COMMON_AUDIO_ALLOW,
  toEmbedUrl: (url) => {
    const match = url.match(/open\.spotify\.com\/(track|playlist|album|episode|show)\/([\w-]+)/);
    const kind = match?.[1];
    const id = match?.[2];
    if (!kind || !id) return null;
    return `https://open.spotify.com/embed/${kind}/${id}`;
  },
  fromEmbedUrl: (url) => {
    const match = url.match(
      /open\.spotify\.com\/embed\/(track|playlist|album|episode|show)\/([\w-]+)/,
    );
    const kind = match?.[1];
    const id = match?.[2];
    if (!kind || !id) return null;
    return `https://open.spotify.com/${kind}/${id}`;
  },
};

const soundcloud: EmbedProvider = {
  id: "soundcloud",
  title: "SoundCloud",
  icon: SoundcloudLogo,
  aspectRatio: "16/9",
  hostnames: ["soundcloud.com"],
  allow: COMMON_AUDIO_ALLOW,
  toEmbedUrl: (url) => {
    // SoundCloud's embed URL embeds the full track URL as a query param.
    if (!/soundcloud\.com\/[^/]+\/[^/]+/.test(url)) return null;
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23161d77`;
  },
  fromEmbedUrl: (url) => {
    const captured = url.match(/url=([^&]+)/)?.[1];
    return captured ? decodeURIComponent(captured) : null;
  },
};

const figma: EmbedProvider = {
  id: "figma",
  title: "Figma",
  icon: FigmaLogo,
  aspectRatio: "4/3",
  hostnames: ["figma.com"],
  toEmbedUrl: (url) => {
    if (!/figma\.com\/(file|proto|design|board)\//.test(url)) return null;
    return `https://www.figma.com/embed?embed_host=scaffold&url=${encodeURIComponent(url)}`;
  },
  fromEmbedUrl: (url) => {
    const captured = url.match(/[?&]url=([^&]+)/)?.[1];
    return captured ? decodeURIComponent(captured) : null;
  },
};

const codepen: EmbedProvider = {
  id: "codepen",
  title: "CodePen",
  icon: PencilSimple,
  aspectRatio: "4/3",
  hostnames: ["codepen.io"],
  toEmbedUrl: (url) => {
    const match = url.match(/codepen\.io\/([\w-]+)\/(?:pen|preview)\/(\w+)/);
    const user = match?.[1];
    const id = match?.[2];
    if (!user || !id) return null;
    return `https://codepen.io/${user}/embed/${id}?default-tab=result`;
  },
  fromEmbedUrl: (url) => {
    const match = url.match(/codepen\.io\/([\w-]+)\/embed\/(\w+)/);
    const user = match?.[1];
    const id = match?.[2];
    if (!user || !id) return null;
    return `https://codepen.io/${user}/pen/${id}`;
  },
};

const githubGist: EmbedProvider = {
  id: "github-gist",
  title: "GitHub Gist",
  icon: GithubLogo,
  aspectRatio: "4/3",
  hostnames: ["gist.github.com"],
  toEmbedUrl: (url) => {
    // Gists embed via a script tag, not an iframe. For an iframe-first
    // approach we point at the raw gist page; for richer rendering the
    // adapter can swap to script embedding. Falls back to the URL.
    return url;
  },
};

const wikipedia: EmbedProvider = {
  id: "wikipedia",
  title: "Wikipedia",
  icon: Article,
  aspectRatio: "4/3",
  hostnames: ["wikipedia.org", "en.wikipedia.org"],
  toEmbedUrl: (url) => url,
};

/** Generic fallback keeps unsupported URLs editable but never iframes them. */
const generic: EmbedProvider = {
  id: "generic",
  title: "Supported URL",
  icon: Globe,
  aspectRatio: "4/3",
  hostnames: [],
  toEmbedUrl: () => null,
};

export const EMBED_PROVIDERS: readonly EmbedProvider[] = [
  youtube,
  vimeo,
  loom,
  spotify,
  soundcloud,
  figma,
  codepen,
  githubGist,
  wikipedia,
  generic,
];

const PROVIDERS_BY_ID = new Map(
  EMBED_PROVIDERS.map((provider) => [provider.id, provider] as const),
);

export function getEmbedProvider(id: string): EmbedProvider | null {
  return PROVIDERS_BY_ID.get(id) ?? null;
}

export interface EmbedInfo {
  provider: EmbedProvider;
  embedUrl: string;
}

/** tldraw-style helper: detect provider from a URL and derive the embed URL. */
export function getEmbedInfo(rawUrl: string): EmbedInfo | null {
  const url = normalizeUrl(rawUrl);
  if (!url) return null;
  const host = hostnameOf(url);
  if (!host) return null;

  for (const provider of EMBED_PROVIDERS) {
    if (provider.id === "generic") continue;
    if (!hostMatches(host, provider.hostnames)) continue;
    const embedUrl = provider.toEmbedUrl(url);
    if (embedUrl && isAllowedIframeProtocol(embedUrl)) {
      return { provider, embedUrl };
    }
  }

  return null;
}

/**
 * Use when the document already records a provider; derive the embed URL.
 * Defensive normalization here too: an older document may have stored a
 * protocol-less URL before normalization shipped, and we don't want a
 * relative iframe src silently loading the editor's own origin.
 */
export function resolveEmbedUrl(providerId: string, url: string): string | null {
  const provider = PROVIDERS_BY_ID.get(providerId);
  if (!provider) return null;
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  const embedUrl = provider.toEmbedUrl(normalized);
  if (!embedUrl || !isAllowedIframeProtocol(embedUrl)) return null;
  return embedUrl;
}
