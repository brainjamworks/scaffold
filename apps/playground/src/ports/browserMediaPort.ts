import { createBrowserMediaPort, type BrowserMediaPort } from "./createBrowserMediaPort";

/**
 * Shared browser media port. Held as a singleton so the object-URL
 * cache survives across React renders and any host can call
 * `releaseUrls()` on reset.
 */
export const browserMediaPort: BrowserMediaPort = createBrowserMediaPort();
