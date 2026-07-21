import type { ResourceLinkKind } from "@scaffold/contracts";

export const RESOURCE_LINK_KIND_LABELS: Record<ResourceLinkKind, string> = {
  article: "Article",
  video: "Video",
  pdf: "PDF",
  audio: "Audio",
  link: "Link",
};

/**
 * Parse a URL into its display host (e.g. `youtube.com`). Returns
 * an empty string for non-URL input. No kind inference — the author
 * picks kind explicitly from the dropdown.
 */
export function readResourceHost(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
