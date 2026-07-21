const SAFE_ABSOLUTE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export function isSafeRichTextLinkUri(
  url: string,
  context: { defaultValidate: (url: string) => boolean },
): boolean {
  const trimmed = url.trim();
  if (!trimmed || !context.defaultValidate(trimmed)) return false;

  try {
    const parsed = new URL(trimmed, "https://scaffold.local");
    if (parsed.origin === "https://scaffold.local") return true;
    return SAFE_ABSOLUTE_LINK_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}
