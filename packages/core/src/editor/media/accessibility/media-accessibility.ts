export type MediaAccessibilityKind = "audio" | "image" | "pdf";

export const MEDIA_ACCESSIBILITY_COPY = {
  altText: {
    label: "Alt text",
    description:
      "Describe the image when it carries information. Leave blank only when it is decorative or already described nearby.",
    placeholder: "Describe the image for screen readers",
  },
  title: {
    label: "Title",
    audioDescription: "Name this audio clip in the document.",
    audioPlaceholder: "Audio title",
  },
} as const;

export function mediaLoadingMessage(kind: MediaAccessibilityKind): string {
  if (kind === "pdf") return "Loading PDF...";
  return kind === "audio" ? "Loading audio..." : "Loading image...";
}

export function mediaMissingMessage(kind: MediaAccessibilityKind): string {
  if (kind === "pdf") return "No PDF";
  return kind === "audio" ? "No audio" : "No image";
}

export function mediaUnavailableMessage(kind: MediaAccessibilityKind): string {
  if (kind === "pdf") return "PDF unavailable";
  return kind === "audio" ? "Audio unavailable" : "Image unavailable";
}
