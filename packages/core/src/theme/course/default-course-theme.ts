import type { PersistedCourseTheme } from "@scaffold/contracts";

import { SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1 } from "./colour-systems/scaffold-indigo/v1";
import { SCAFFOLD_FLOW_DESIGN_V1 } from "./designs/scaffold-flow/v1/definition";

export function createDefaultPersistedCourseTheme(): PersistedCourseTheme {
  return Object.freeze({
    schemaVersion: 1,
    design: Object.freeze({
      id: SCAFFOLD_FLOW_DESIGN_V1.id,
      revision: SCAFFOLD_FLOW_DESIGN_V1.revision,
    }),
    colourSystem: Object.freeze({
      id: SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1.id,
      revision: SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1.revision,
    }),
    overrides: Object.freeze({}),
  });
}
