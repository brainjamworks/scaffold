import { useEffect, useMemo, useState } from "react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  GalleryDataSchema,
  GalleryItemDataSchema,
  type GalleryData,
  type GalleryItemData,
} from "@scaffold/contracts";

import type { LightboxItem } from "@/ui/components/Lightbox/Lightbox";
import { renderRuntimeRichTextNode } from "@/editor/rich-text/runtime/render-rich-text";
import {
  EmptyScaffoldRichTextDocument,
  isScaffoldRichTextDocumentEmpty,
  toTiptapRichTextDocument,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";

import { mediaUnavailableMessage } from "@/editor/media/accessibility/media-accessibility";
import { GALLERY_ITEM_NODE, emptyGalleryData } from "./content";

type CoreGalleryData = Omit<GalleryData, "caption"> & {
  caption: ScaffoldRichTextDocument;
};

type CoreGalleryItemData = Omit<GalleryItemData, "caption"> & {
  caption: ScaffoldRichTextDocument;
};

export interface GalleryRawItem {
  id: string;
  data: CoreGalleryItemData | null;
}

export interface GalleryResolvedItem {
  key: string;
  alt: string;
  caption: ScaffoldRichTextDocument;
  url: string | null;
  loading: boolean;
  error: string | null;
}

export interface GalleryMediaPort {
  resolve: (mediaId: string) => Promise<string>;
}

export function parseGalleryData(raw: unknown): CoreGalleryData {
  const parsed = GalleryDataSchema.safeParse(raw);
  return toCoreGalleryData(parsed.success ? parsed.data : emptyGalleryData());
}

export function readGalleryItems(node: ProseMirrorNode): GalleryRawItem[] {
  const out: GalleryRawItem[] = [];
  node.forEach((child) => {
    if (child.type.name !== GALLERY_ITEM_NODE) return;
    const id = child.attrs["id"];
    const raw = child.attrs["data"];
    const parsed = raw ? GalleryItemDataSchema.safeParse(raw) : null;
    out.push({
      id: typeof id === "string" ? id : "",
      data: parsed?.success ? toCoreGalleryItemData(parsed.data) : null,
    });
  });
  return out;
}

function toCoreGalleryData(data: GalleryData): CoreGalleryData {
  return {
    ...data,
    caption: toTiptapRichTextDocument(data.caption) ?? EmptyScaffoldRichTextDocument,
  };
}

function toCoreGalleryItemData(data: GalleryItemData): CoreGalleryItemData {
  return {
    ...data,
    caption: toTiptapRichTextDocument(data.caption) ?? EmptyScaffoldRichTextDocument,
  };
}

export function useResolvedGalleryItems(
  rawItems: readonly GalleryRawItem[],
  mediaPort: GalleryMediaPort | null,
): GalleryResolvedItem[] {
  const [resolvedUrls, setResolvedUrls] = useState<
    Record<string, { mediaId: string; url: string | null; error: string | null }>
  >({});

  useEffect(() => {
    let cancelled = false;
    const ids = rawItems
      .filter((item) => item.data?.image?.mode === "managed")
      .map((item) => ({
        id: item.id,
        mediaId: item.data?.image?.mode === "managed" ? item.data.image.mediaId : "",
      }))
      .filter((item) => item.mediaId);

    ids.forEach(async ({ id, mediaId }) => {
      if (resolvedUrls[id]?.mediaId === mediaId) return;
      if (!mediaPort) {
        if (!cancelled) {
          setResolvedUrls((prev) => ({
            ...prev,
            [id]: { mediaId, url: null, error: mediaUnavailableMessage("image") },
          }));
        }
        return;
      }
      try {
        const url = await mediaPort.resolve(mediaId);
        if (cancelled) return;
        setResolvedUrls((prev) => ({ ...prev, [id]: { mediaId, url, error: null } }));
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : mediaUnavailableMessage("image");
        setResolvedUrls((prev) => ({
          ...prev,
          [id]: { mediaId, url: null, error: message },
        }));
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawItems, mediaPort]);

  return useMemo(() => {
    return rawItems.map(({ id, data }) => {
      if (!data) {
        return {
          key: id,
          alt: "",
          caption: EmptyScaffoldRichTextDocument,
          url: null,
          loading: false,
          error: null,
        };
      }
      if (data.image?.mode === "external") {
        return {
          key: id,
          alt: data.image.alt ?? "",
          caption: data.caption,
          url: data.image.src,
          loading: false,
          error: null,
        };
      }
      if (!data.image) {
        return {
          key: id,
          alt: "",
          caption: data.caption,
          url: null,
          loading: false,
          error: null,
        };
      }
      const resolved = resolvedUrls[id];
      const currentResolution = resolved?.mediaId === data.image.mediaId ? resolved : undefined;
      return {
        key: id,
        alt: data.image.alt ?? "",
        caption: data.caption,
        url: currentResolution?.url ?? null,
        loading: !currentResolution || (!currentResolution.url && !currentResolution.error),
        error: currentResolution?.error ?? null,
      };
    });
  }, [rawItems, resolvedUrls]);
}

export function useGalleryLightboxItems(items: readonly GalleryResolvedItem[]): LightboxItem[] {
  return useMemo<LightboxItem[]>(
    () =>
      items
        .filter((item) => Boolean(item.url))
        .map((item) => {
          const base: LightboxItem = {
            key: item.key,
            src: item.url!,
            alt: item.alt,
          };
          return isScaffoldRichTextDocumentEmpty(item.caption)
            ? base
            : { ...base, caption: renderRuntimeRichTextNode(item.caption) };
        }),
    [items],
  );
}
