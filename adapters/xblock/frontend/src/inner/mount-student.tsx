import { createRoot } from "react-dom/client";

import { XBlockStudentApp } from "./XBlockStudentApp";
import type { ScaffoldXBlockInnerInitPayload } from "../types";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

export function mountXBlockStudent(
  element: Element,
  data: ScaffoldXBlockInnerInitPayload,
  bridge: XBlockInnerBridge,
): void {
  const mount = document.createElement("div");
  mount.className = "sc-xblock-react-root";
  element.appendChild(mount);

  createRoot(mount).render(<XBlockStudentApp data={data} bridge={bridge} />);
}
