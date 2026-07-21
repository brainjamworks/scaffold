import {
  createBrowserPersistencePort,
  type BrowserPersistencePort,
} from "./createBrowserPersistencePort";

/**
 * Shared browser persistence port. The provider wires it into the
 * runtime so editor saves land in IndexedDB; the playground reads the same
 * instance on init to hydrate the persisted document. One connection,
 * consistent reads and writes.
 */
export const browserPersistencePort: BrowserPersistencePort = createBrowserPersistencePort();
