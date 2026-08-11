export {
  createCoreScaffoldAuthoringComposition,
  type ScaffoldAuthoringComposition,
} from "@/composition/authoring/scaffold-authoring-composition";
export type { UnavailableContentRef } from "@/document/model/establishment";
export { ScaffoldAuthoringEntry } from "@/editor/shell/authoring/ScaffoldAuthoringEntry";
export { AuthoringHeaderIconButton } from "@/editor/shell/chrome/AuthoringHeaderIconButton";
export {
  CourseThemePortalBoundary,
  CourseThemeProvider,
  useCourseTheme,
  type CourseThemePortalBoundaryProps,
  type CourseThemeProviderProps,
} from "@/theme/course/CourseThemeProvider";
export type {
  ScaffoldAuthoringHostActionSlots,
  ScaffoldAuthoringHostActionsContext,
  ScaffoldAuthoringSaveState,
  ScaffoldPreviewServicesFactory,
  ScaffoldLearnerPreviewContent,
} from "@/editor/shell/authoring/ScaffoldAuthoringApp";
export type { ScaffoldAuthoringEntryProps } from "@/editor/shell/authoring/ScaffoldAuthoringEntry";
export type {
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringEntryHostServices,
  ScaffoldAuthoringHostServices,
  ScaffoldLearnerHostServices,
  ScaffoldProductAccess,
} from "@/host/contracts";
