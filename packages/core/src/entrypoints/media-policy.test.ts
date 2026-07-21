import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as mediaPolicy from "@scaffold/core/media-policy";
import {
  MEDIA_UPLOAD_MAX_BYTES,
  MediaUploadValidationError,
  filterMediaList,
  inferMediaUploadType,
  isSafeExternalMediaUrl,
  validateMediaUploadFile,
} from "@scaffold/core/media-policy";
import type { MediaUploadType } from "@scaffold/core/ports";

interface MediaListItemContract {
  id: string;
  url: string;
  mediaType: MediaUploadType;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt?: string;
  thumbnailUrl?: string;
}

interface MediaListFilterContract {
  kind?: "media" | "documents" | "all";
  mediaType?: MediaUploadType;
}

describe("@scaffold/core/media-policy", () => {
  it("publishes the exact media-policy value surface", () => {
    expect(Object.keys(mediaPolicy).sort()).toEqual([
      "MEDIA_UPLOAD_MAX_BYTES",
      "MediaUploadValidationError",
      "filterMediaList",
      "inferMediaUploadType",
      "isSafeExternalMediaUrl",
      "validateMediaUploadFile",
    ]);
    expect(Object.values(mediaPolicy).every((value) => value !== undefined)).toBe(true);
  });

  it("publishes the exact media-policy callable types", () => {
    expectTypeOf(MEDIA_UPLOAD_MAX_BYTES).toEqualTypeOf<Record<MediaUploadType, number>>();
    expectTypeOf(MediaUploadValidationError).toMatchTypeOf<new (message: string) => Error>();
    expectTypeOf(filterMediaList).toEqualTypeOf<
      (items: MediaListItemContract[], filter?: MediaListFilterContract) => MediaListItemContract[]
    >();
    expectTypeOf(inferMediaUploadType).toEqualTypeOf<
      (file: Pick<File, "name" | "type">) => MediaUploadType
    >();
    expectTypeOf(validateMediaUploadFile).toEqualTypeOf<
      (
        file: Pick<File, "name" | "type" | "size">,
        requestedMediaType?: MediaUploadType,
      ) => MediaUploadType
    >();
    expectTypeOf(isSafeExternalMediaUrl).toEqualTypeOf<(value: string) => boolean>();
  });
});
