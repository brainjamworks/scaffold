/**
 * Block owners whose semantic members are only reachable through a *mounted*
 * owner: navigating to one of their members activates the owner first, and with
 * no activation binding registered the navigation resolves to `reached-owner`
 * with reason `owner-unmounted`.
 *
 * `annotated_figure` joined this set in 062fb1ab (2026-08-27), which gave the
 * Annotated Figure an interactive control binding.
 */
export const ACTIVATING_BLOCK_MEMBER_OWNER_TYPES: ReadonlySet<string> = new Set([
  "annotated_figure",
  "flashcard",
  "gallery",
  "process_flow",
  "roadmap",
  "timeline",
]);
