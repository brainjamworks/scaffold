import { z } from "zod";

export function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const ExternalHttpUrlSchema = z.string().trim().url().refine(isHttpOrHttpsUrl, {
  message: "URL must use http or https",
});
export type ExternalHttpUrl = z.infer<typeof ExternalHttpUrlSchema>;

export const OptionalExternalHttpUrlSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || isHttpOrHttpsUrl(value), {
    message: "URL must use http or https",
  });
export type OptionalExternalHttpUrl = z.infer<typeof OptionalExternalHttpUrlSchema>;
