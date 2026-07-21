export const MEDIA_UPLOAD_TYPES = [
  "image",
  "audio",
  "video",
  "pdf",
  "document",
  "spreadsheet",
  "presentation",
  "archive",
  "text",
  "other",
] as const;

export type MediaUploadType = (typeof MEDIA_UPLOAD_TYPES)[number];

export const SCAFFOLD_MEDIA_CONTEXTS = ["authoring", "preview", "runtime"] as const;

export type ScaffoldMediaContext = (typeof SCAFFOLD_MEDIA_CONTEXTS)[number];

export interface ScaffoldResolvedMediaMap {
  [mediaId: string]: string;
}

export interface MediaUploadMeta {
  /**
   * Product-level upload category, separate from the browser MIME type.
   */
  mediaType: MediaUploadType;
}

export interface MediaUploadResult {
  id: string;
  url: string;
  mediaType: MediaUploadType;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface MediaListItem {
  id: string;
  url: string;
  mediaType: MediaUploadType;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt?: string;
  thumbnailUrl?: string;
}

export interface MediaListFilter {
  kind?: "media" | "documents" | "all";
  mediaType?: MediaUploadType;
}

export interface MediaPort {
  /**
   * Host mode for managed media APIs. Blocks do not branch on this value; the
   * adapter maps it to host-specific draft, preview, or published file storage.
   */
  context?: ScaffoldMediaContext;
  /** Resolve a stored managed-media id to a fetchable URL. */
  resolve: (mediaId: string) => Promise<string>;
  /** Upload a file and return the stored media id plus an immediate URL. */
  upload: (
    file: File,
    meta: MediaUploadMeta,
    onProgress?: (pct: number) => void,
  ) => Promise<MediaUploadResult>;
  /**
   * Optional media browser source. If omitted, file pickers hide their Browse
   * tab and only expose upload / external URL flows.
   */
  list?: (filter?: MediaListFilter) => Promise<MediaListItem[]>;
}
