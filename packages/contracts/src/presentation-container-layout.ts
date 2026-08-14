import { z } from "zod";

export const PresentationContentLayout = {
  Flow: "flow",
  Sequence: "sequence",
} as const;

export const PresentationContentLayoutSchema = z.nativeEnum(PresentationContentLayout);

export type PresentationContentLayout = z.infer<typeof PresentationContentLayoutSchema>;
