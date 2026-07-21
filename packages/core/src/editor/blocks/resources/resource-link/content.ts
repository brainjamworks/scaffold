import { ResourceLinkDataSchema, type ResourceLinkData } from "@scaffold/contracts";

export function emptyResourceLinkData(overrides: Partial<ResourceLinkData> = {}): ResourceLinkData {
  return ResourceLinkDataSchema.parse(overrides);
}
