import { isHttpOrHttpsUrl } from "@scaffold/contracts";

import {
  MEDIA_UPLOAD_TYPES,
  type MediaListFilter,
  type MediaListItem,
  type MediaUploadType,
} from "@/host/ports/media";

export const MEDIA_UPLOAD_MAX_BYTES: Record<MediaUploadType, number> = {
  image: 10 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  video: 250 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  spreadsheet: 25 * 1024 * 1024,
  presentation: 25 * 1024 * 1024,
  archive: 50 * 1024 * 1024,
  text: 2 * 1024 * 1024,
  other: 10 * 1024 * 1024,
};

const WORD_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
]);

const SPREADSHEET_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/csv",
]);

const PRESENTATION_MIME_TYPES = new Set([
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.presentation",
]);

const ARCHIVE_MIME_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/gzip",
  "application/x-tar",
]);

const WORD_EXTENSIONS = new Set(["doc", "docx", "odt", "rtf"]);
const SPREADSHEET_EXTENSIONS = new Set(["csv", "ods", "xls", "xlsx"]);
const PRESENTATION_EXTENSIONS = new Set(["odp", "ppt", "pptx"]);
const ARCHIVE_EXTENSIONS = new Set(["7z", "gz", "rar", "tar", "tgz", "zip"]);
const TEXT_EXTENSIONS = new Set(["md", "txt"]);

const IMAGE_MIME_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/ogg", "video/quicktime", "video/webm"]);

const PDF_MIME_TYPES = new Set(["application/pdf"]);
const TEXT_MIME_TYPES = new Set(["text/markdown", "text/plain"]);

const ALLOWED_MEDIA_UPLOAD_MIME_TYPES: Record<MediaUploadType, Set<string>> = {
  image: IMAGE_MIME_TYPES,
  audio: AUDIO_MIME_TYPES,
  video: VIDEO_MIME_TYPES,
  pdf: PDF_MIME_TYPES,
  document: WORD_MIME_TYPES,
  spreadsheet: SPREADSHEET_MIME_TYPES,
  presentation: PRESENTATION_MIME_TYPES,
  archive: ARCHIVE_MIME_TYPES,
  text: TEXT_MIME_TYPES,
  other: new Set(),
};

const EXTENSION_ALLOWLISTS: Record<MediaUploadType, Set<string>> = {
  image: new Set(["avif", "gif", "jpeg", "jpg", "png", "webp"]),
  audio: new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav", "weba"]),
  video: new Set(["mov", "mp4", "ogv", "webm"]),
  pdf: new Set(["pdf"]),
  document: WORD_EXTENSIONS,
  spreadsheet: SPREADSHEET_EXTENSIONS,
  presentation: PRESENTATION_EXTENSIONS,
  archive: ARCHIVE_EXTENSIONS,
  text: TEXT_EXTENSIONS,
  other: new Set(),
};

const MEDIA_KIND_TYPES = new Set<MediaUploadType>(["image", "audio", "video"]);
const DOCUMENT_KIND_TYPES = new Set<MediaUploadType>([
  "pdf",
  "document",
  "spreadsheet",
  "presentation",
  "archive",
  "text",
  "other",
]);

export class MediaUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaUploadValidationError";
  }
}

function extensionForFileName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) return "";
  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function filterMediaList(items: MediaListItem[], filter?: MediaListFilter): MediaListItem[] {
  if (!filter) return items;
  if (filter.mediaType) {
    return items.filter((item) => item.mediaType === filter.mediaType);
  }
  if (filter.kind === "media") {
    return items.filter((item) => MEDIA_KIND_TYPES.has(item.mediaType));
  }
  if (filter.kind === "documents") {
    return items.filter((item) => DOCUMENT_KIND_TYPES.has(item.mediaType));
  }
  return items;
}

export function inferMediaUploadType(file: Pick<File, "name" | "type">): MediaUploadType {
  const mimeType = file.type.toLowerCase();
  const extension = extensionForFileName(file.name);

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (WORD_MIME_TYPES.has(mimeType) || WORD_EXTENSIONS.has(extension)) {
    return "document";
  }
  if (SPREADSHEET_MIME_TYPES.has(mimeType) || SPREADSHEET_EXTENSIONS.has(extension)) {
    return "spreadsheet";
  }
  if (PRESENTATION_MIME_TYPES.has(mimeType) || PRESENTATION_EXTENSIONS.has(extension)) {
    return "presentation";
  }
  if (ARCHIVE_MIME_TYPES.has(mimeType) || ARCHIVE_EXTENSIONS.has(extension)) {
    return "archive";
  }
  if (mimeType.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }
  return "other";
}

function validateMediaUploadType(mediaType: string): asserts mediaType is MediaUploadType {
  if (!(MEDIA_UPLOAD_TYPES as readonly string[]).includes(mediaType)) {
    throw new MediaUploadValidationError("This file type is not supported.");
  }
}

function fileLabel(file: Pick<File, "name">): string {
  return file.name || "file";
}

function formatUploadLimit(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.floor(bytes / 1024 / 1024)} MB`;
  if (bytes >= 1024) return `${Math.floor(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function validateMediaUploadFile(
  file: Pick<File, "name" | "type" | "size">,
  requestedMediaType?: MediaUploadType,
): MediaUploadType {
  const inferred = inferMediaUploadType(file);
  const mediaType = requestedMediaType ?? inferred;
  validateMediaUploadType(mediaType);

  if (requestedMediaType && inferred !== requestedMediaType) {
    throw new MediaUploadValidationError(
      `${fileLabel(file)} does not match the selected ${requestedMediaType} upload type.`,
    );
  }

  const limit = MEDIA_UPLOAD_MAX_BYTES[mediaType];
  if (file.size > limit) {
    throw new MediaUploadValidationError(
      `${fileLabel(file)} is too large. The ${mediaType} upload limit is ${formatUploadLimit(limit)}.`,
    );
  }

  const mimeType = file.type.toLowerCase();
  const extension = extensionForFileName(file.name);
  const allowedMimeTypes = ALLOWED_MEDIA_UPLOAD_MIME_TYPES[mediaType];
  const allowedExtensions = EXTENSION_ALLOWLISTS[mediaType];
  const plainTextCsv =
    mediaType === "spreadsheet" && extension === "csv" && mimeType === "text/plain";
  const mimeAllowed = Boolean(mimeType) && (allowedMimeTypes.has(mimeType) || plainTextCsv);
  const extensionAllowed = Boolean(extension) && allowedExtensions.has(extension);
  const genericMime = mimeType === "application/octet-stream";

  if (mediaType === "other") {
    throw new MediaUploadValidationError(`${fileLabel(file)} is not a supported upload type.`);
  }

  if (extension && !extensionAllowed) {
    throw new MediaUploadValidationError(`${fileLabel(file)} is not an allowed ${mediaType} file.`);
  }

  if (mimeType && !genericMime && !mimeAllowed) {
    throw new MediaUploadValidationError(`${fileLabel(file)} is not an allowed ${mediaType} file.`);
  }

  if (!mimeAllowed && !extensionAllowed) {
    throw new MediaUploadValidationError(`${fileLabel(file)} is not an allowed ${mediaType} file.`);
  }

  return mediaType;
}

export function isSafeExternalMediaUrl(value: string): boolean {
  return isHttpOrHttpsUrl(value);
}
