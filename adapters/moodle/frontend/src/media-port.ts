import { validateMediaUploadFile } from "@scaffold/core/media-policy";
import type { MediaPort } from "@scaffold/core/ports";

import { moodleCall, type MoodleAjaxResponse } from "./api";

interface MediaResponse extends MoodleAjaxResponse {
  mediaId?: unknown;
  url?: unknown;
}

export function createMoodleMediaPort(cmid: number): MediaPort {
  return {
    resolve: async (mediaId) => {
      const response = await moodleCall<MediaResponse>("mod_scaffold_resolve_media", {
        cmid,
        mediaid: mediaId,
      });

      if (typeof response.url !== "string") {
        throw new Error("Moodle media resolver did not return a URL");
      }

      return response.url;
    },
    list: async (filter) => {
      const response = await moodleCall<MediaResponse & { items?: unknown }>(
        "mod_scaffold_list_media",
        {
          cmid,
          kind: filter?.kind ?? "",
          mediatype: filter?.mediaType ?? "",
        },
      );

      if (!Array.isArray(response.items)) return [];
      const items = response.items as Array<Record<string, unknown>>;
      return items
        .filter(
          (raw): raw is Record<string, unknown> =>
            typeof raw.id === "string" &&
            typeof raw.url === "string" &&
            typeof raw.mediaType === "string",
        )
        .map((raw) => ({
          id: String(raw.id),
          url: String(raw.url),
          mediaType: raw.mediaType as never,
          fileName: typeof raw.fileName === "string" ? raw.fileName : "",
          mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "",
          size: typeof raw.size === "number" ? raw.size : 0,
          ...(typeof raw.createdAt === "string" ? { createdAt: raw.createdAt } : {}),
        }));
    },
    upload: async (file, meta, onProgress) => {
      const mediaType = validateMediaUploadFile(file, meta.mediaType);
      onProgress?.(0);
      const dataUrl = await readFileAsDataUrl(file);
      onProgress?.(60);

      const response = await moodleCall<MediaResponse>("mod_scaffold_upload_media", {
        cmid,
        mediatype: mediaType,
        filename: file.name,
        contenttype: file.type,
        dataurl: dataUrl,
      });

      if (typeof response.mediaId !== "string" || typeof response.url !== "string") {
        throw new Error("Moodle media upload did not return a media id and URL");
      }

      onProgress?.(100);
      return {
        id: response.mediaId,
        url: response.url,
        mediaType,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
      };
    },
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("could not read media file"));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("could not read media file"));
    });
    reader.readAsDataURL(file);
  });
}
