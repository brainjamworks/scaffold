import { EmbedDataSchema, type EmbedData } from "@scaffold/contracts";

import { getEmbedInfo, getEmbedProvider, normalizeUrl } from "./embed-registry";

export function emptyEmbedData(overrides: Partial<EmbedData> = {}): EmbedData {
  return EmbedDataSchema.parse(overrides);
}

export function readEmbedData(value: unknown): EmbedData {
  const parsed = EmbedDataSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyEmbedData();
}

export function updateEmbedDataUrl(current: EmbedData, rawUrl: string): EmbedData {
  const url = normalizeUrl(rawUrl);
  if (!url) {
    return EmbedDataSchema.parse({
      ...current,
      url: "",
    });
  }

  const info = getEmbedInfo(url);
  if (info) {
    return EmbedDataSchema.parse({
      ...current,
      url,
      provider: info.provider.id,
      aspectRatio: info.provider.aspectRatio,
    });
  }

  const generic = getEmbedProvider("generic");
  if (!generic) {
    throw new Error("Embed provider registry is missing the generic provider.");
  }
  return EmbedDataSchema.parse({
    ...current,
    url,
    provider: "generic",
    aspectRatio: generic.aspectRatio,
  });
}

export function normalizeEmbedSettingsUpdate({
  current,
  next,
}: {
  current: unknown;
  next: unknown;
}): EmbedData {
  const currentData = readEmbedData(current);
  const nextData = readEmbedData(next);

  if (nextData.url === currentData.url) {
    return nextData;
  }

  return updateEmbedDataUrl(nextData, nextData.url);
}
