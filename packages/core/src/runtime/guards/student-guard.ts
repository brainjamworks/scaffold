import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Student-mode transaction guard.
 *
 * Defense in depth alongside `editor.editable = false`. The `editable`
 * flag controls whether contentEditable is set on the DOM — but a
 * sufficiently motivated user can devtool that back to true. This
 * extension installs a ProseMirror `filterTransaction` plugin that
 * REJECTS any transaction that mutates the document, regardless of the
 * editor's editable flag.
 *
 * Selection-only transactions (cursor moves, range selects) are still
 * allowed so the student can navigate the document for accessibility
 * (keyboard nav, screen reader, copy text out).
 *
 * Adapters that mount the editor in student mode should include this
 * extension AND set `editable: false`. Together they make client-side
 * editing impossible without code modification.
 *
 * Authoritative grading + persistence still belong on the server — this
 * is a UX guardrail + defense in depth, not the only line of defense.
 */
export const StudentGuard = Extension.create({
  name: "studentGuard",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("studentGuard"),
        filterTransaction(tr) {
          // Allow selection-only changes so navigation/copy still work.
          if (!tr.docChanged) return true;

          // Adapters can flag system-internal transactions (initial
          // content load, collab sync from the server) by setting
          // `tr.setMeta('studentGuard', 'allow')` on the transaction.
          // The xblock / LTI mount code applies this meta when
          // hydrating from persistence so the doc populates correctly.
          if (tr.getMeta("studentGuard") === "allow") return true;

          // Block everything else — typing, deleting, paste, drag-and-
          // drop, command-dispatched node-attribute changes, etc.
          return false;
        },
      }),
    ];
  },
});
