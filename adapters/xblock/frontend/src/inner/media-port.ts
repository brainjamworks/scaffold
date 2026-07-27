import { validateMediaUploadFile } from "@scaffold/core/media-policy";
import type {
  MediaPort,
  ScaffoldMediaContext,
  ScaffoldResolvedMediaMap,
} from "@scaffold/core/ports";

import type { BridgeHandlerResponse } from "./handler-response";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

export interface XBlockMediaPortOptions {
  mediaContext?: ScaffoldMediaContext | undefined;
  resolvedMedia?: ScaffoldResolvedMediaMap | null | undefined;
}

const DEFAULT_MEDIA_CONTEXT: ScaffoldMediaContext = "runtime";

export function createXBlockMediaPort(
  bridge: XBlockInnerBridge,
  options: XBlockMediaPortOptions = {},
): MediaPort {
  const mediaContext = options.mediaContext ?? DEFAULT_MEDIA_CONTEXT;
  const resolvedMedia = sanitizeResolvedMedia(options.resolvedMedia);

  return {
    context: mediaContext,
    resolve: async (mediaId) => {
      const resolvedUrl = resolvedMedia[mediaId];
      if (resolvedUrl) return resolvedUrl;

      const response = await bridge.request<BridgeHandlerResponse & { url?: unknown }>(
        "media.resolve",
        { mediaId, context: mediaContext },
      );

      if (typeof response.url !== "string") {
        throw new Error("XBlock media resolver did not return a URL");
      }

      return response.url;
    },
    list: async (filter) => {
      const response = await bridge.request<BridgeHandlerResponse & { items?: unknown }>(
        "media.list",
        {
          context: mediaContext,
          ...(filter?.kind ? { kind: filter.kind } : {}),
          ...(filter?.mediaType ? { mediaType: filter.mediaType } : {}),
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
          ...(typeof raw.thumbnailUrl === "string" ? { thumbnailUrl: raw.thumbnailUrl } : {}),
        }));
    },
    upload: async (file, meta, onProgress) => {
      const mediaType = validateMediaUploadFile(file, meta.mediaType);
      onProgress?.(0);
      const dataUrl = await readFileAsDataUrl(file);
      onProgress?.(60);

      const response = await bridge.request<
        BridgeHandlerResponse & { mediaId?: unknown; url?: unknown }
      >("media.upload", {
        context: mediaContext,
        mediaType,
        filename: file.name,
        contentType: file.type,
        dataUrl,
      });

      if (typeof response.mediaId !== "string" || typeof response.url !== "string") {
        throw new Error("XBlock media upload did not return a media id and URL");
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

function sanitizeResolvedMedia(
  value: ScaffoldResolvedMediaMap | null | undefined,
): ScaffoldResolvedMediaMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" &&
        entry[0].length > 0 &&
        typeof entry[1] === "string" &&
        entry[1].length > 0,
    ),
  );
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
