/**
 * Named z-index scale. Mirrors the CSS custom properties in styles/globals.css.
 *
 * Use in inline styles where a runtime style value is required:
 *   style={{ zIndex: zIndex.modal }}
 */
export const zIndex = {
  behind: -10,
  background: -1,
  base: 0,
  content: 1,
  elevated: 5,

  sticky: 10,
  stickyHeader: 15,

  interactive: 20,
  dragOverlay: 30,

  nav: 50,
  navMenu: 51,

  dropdown: 100,

  overlay: 120,
  editorToolbar: 130,
  editorBubble: 135,
  editorTextBubble: 140,
  overlayHost: 190,

  modalBackdrop: 200,
  modal: 210,
  modalContent: 220,
  nestedModal: 230,

  popover: 250,
  tooltip: 250,

  toast: 300,
  notification: 310,

  critical: 400,
  max: 9999,
} as const;

export type ZIndexLevel = keyof typeof zIndex;
