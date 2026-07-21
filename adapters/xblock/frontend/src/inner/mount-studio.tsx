import { createRoot } from "react-dom/client";

import { XBlockStudioApp } from "./XBlockStudioApp";
import type { ScaffoldXBlockInnerInitPayload } from "../types";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

export function mountXBlockStudio(
  element: Element,
  data: ScaffoldXBlockInnerInitPayload,
  bridge: XBlockInnerBridge,
): void {
  const mount = document.createElement("div");
  mount.className = "sc-xblock-react-root";
  element.appendChild(mount);

  createRoot(mount).render(<XBlockStudioApp data={data} bridge={bridge} />);
}
