import { clsx, type ClassValue } from "clsx";

/**
 * Conditionally compose class names.
 *
 * Keep this helper small and framework-neutral: Scaffold styles are authored
 * as named `.sc-*` CSS classes, so there is no utility-class conflict resolver
 * here.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
