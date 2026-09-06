import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { Result, type Result as ResultType } from "better-result";
import { useRef, useSyncExternalStore } from "react";

import type { CourseDocumentAuthoringFailure } from "@/document/authoring/CourseDocumentEditor";
import { canonicalizeDocumentTitle } from "@/editor/shell/chrome/Header";
import type { SaveableScaffoldArtifact } from "@/host/ports";
import {
  CourseDocumentAttrsSchema,
  PersistedCourseThemeSchema,
  type PersistedCourseTheme,
} from "@/schemas/course-document";

export interface AuthoringDocumentSnapshot {
  readonly revision: number;
  readonly artifact: SaveableScaffoldArtifact;
}

export type AuthoringDocumentState =
  | { readonly status: "valid"; readonly snapshot: AuthoringDocumentSnapshot }
  | {
      readonly status: "invalid";
      readonly revision: number;
      readonly failure: CourseDocumentAuthoringFailure;
    };

export interface AuthoringDocumentBinding {
  readonly editor: TiptapEditor | null;
  readonly theme: PersistedCourseTheme | null;
  readonly title: string;
  getSnapshot(): AuthoringDocumentState;
  subscribe(listener: () => void): () => void;
  capture(): ResultType<AuthoringDocumentSnapshot, CourseDocumentAuthoringFailure>;
  setTitle(title: string): void;
  acknowledgeSavedTitle(revision: number, title: string): void;
  acceptCanonicalUpdate(content: JSONContent, sourceDocument: object): void;
  reportDocumentError(failure: CourseDocumentAuthoringFailure): void;
  setEditor(editor: TiptapEditor): void;
}

export interface UseAuthoringDocumentInput {
  readonly source: unknown;
  readonly artifact: SaveableScaffoldArtifact;
}

class AuthoringDocumentBindingOwner implements AuthoringDocumentBinding {
  readonly source: unknown;
  readonly #listeners = new Set<() => void>();
  #artifact: SaveableScaffoldArtifact;
  #canonicalSource: object | null = null;
  #editor: TiptapEditor | null = null;
  #hydrating = true;
  #hydrationFrame: number | null = null;
  #revision = 0;
  #state: AuthoringDocumentState;
  #theme: PersistedCourseTheme | null;
  #title: string;

  constructor({ source, artifact }: UseAuthoringDocumentInput) {
    this.source = source;
    this.#artifact = ownArtifact(artifact);
    this.#title = artifact.title;
    this.#theme = readPersistedCourseThemeFromContent(this.#artifact.content);
    this.#state = this.#validState();
  }

  get editor(): TiptapEditor | null {
    return this.#editor;
  }

  get theme(): PersistedCourseTheme | null {
    return this.#theme;
  }

  get title(): string {
    return this.#title;
  }

  readonly getSnapshot = (): AuthoringDocumentState => this.#state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  capture(): ResultType<AuthoringDocumentSnapshot, CourseDocumentAuthoringFailure> {
    this.#finishHydration();
    if (this.#state.status === "invalid") return Result.err(this.#state.failure);
    const canonicalTitle = canonicalizeDocumentTitle(this.#title);
    if (canonicalTitle !== this.#title) {
      this.#title = canonicalTitle;
      this.#artifact = replaceArtifactTitle(this.#artifact, canonicalTitle);
      this.#state = this.#validState();
      this.#emit();
    }
    const state = this.#state;
    if (state.status === "invalid") return Result.err(state.failure);
    return Result.ok(cloneSnapshot(state.snapshot));
  }

  setTitle(title: string): void {
    if (title === this.#title) return;
    this.#finishHydration();
    this.#title = title;
    this.#revision += 1;
    this.#artifact = replaceArtifactTitle(this.#artifact, canonicalizeDocumentTitle(title));
    this.#state =
      this.#state.status === "valid"
        ? this.#validState()
        : Object.freeze({
            status: "invalid" as const,
            revision: this.#revision,
            failure: this.#state.failure,
          });
    this.#emit();
  }

  acknowledgeSavedTitle(revision: number, title: string): void {
    if (
      title.length === 0 ||
      this.#state.status === "invalid" ||
      this.#state.snapshot.revision !== revision ||
      (title === this.#title && title === this.#artifact.title)
    ) {
      return;
    }
    this.#title = title;
    this.#artifact = replaceArtifactTitle(this.#artifact, title);
    this.#state = this.#validState();
    this.#emit();
  }

  acceptCanonicalUpdate(content: JSONContent, sourceDocument: object): void {
    if (this.#state.status === "valid" && sourceDocument === this.#canonicalSource) {
      return;
    }
    if (!this.#hydrating) this.#revision += 1;
    const ownedContent = ownContent(content);
    this.#canonicalSource = sourceDocument;
    this.#artifact = Object.freeze({
      ...this.#artifact,
      title: canonicalizeDocumentTitle(this.#title),
      content: ownedContent,
    });
    this.#theme = readPersistedCourseThemeFromContent(ownedContent);
    this.#state = this.#validState();
    this.#emit();
  }

  reportDocumentError(failure: CourseDocumentAuthoringFailure): void {
    if (this.#state.status === "invalid" && valuesEqual(this.#state.failure, failure)) return;
    this.#revision += 1;
    this.#state = Object.freeze({ status: "invalid", revision: this.#revision, failure });
    this.#emit();
  }

  setEditor(editor: TiptapEditor): void {
    const isInitialEditor = this.#editor === null;
    const nextTheme = readPersistedCourseThemeFromEditor(editor);
    const editorChanged = this.#editor !== editor;
    const themeChanged = !valuesEqual(this.#theme, nextTheme);
    if (!editorChanged && !themeChanged) {
      this.#finishHydration();
      return;
    }
    this.#editor = editor;
    if (themeChanged) this.#theme = nextTheme;
    this.#state =
      this.#state.status === "valid" ? this.#validState() : Object.freeze({ ...this.#state });
    this.#emit();
    if (isInitialEditor && this.#hydrationFrame === null) {
      this.#hydrationFrame = requestAnimationFrame(() => {
        this.#hydrationFrame = null;
        this.#hydrating = false;
      });
    } else if (!isInitialEditor) {
      this.#finishHydration();
    }
  }

  #finishHydration(): void {
    if (!this.#hydrating) return;
    this.#hydrating = false;
    if (this.#hydrationFrame === null) return;
    cancelAnimationFrame(this.#hydrationFrame);
    this.#hydrationFrame = null;
  }

  #validState(): AuthoringDocumentState {
    return Object.freeze({
      status: "valid",
      snapshot: Object.freeze({
        revision: this.#revision,
        artifact: this.#artifact,
      }),
    });
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

export function useAuthoringDocument({
  source,
  artifact,
}: UseAuthoringDocumentInput): AuthoringDocumentBinding {
  const ownerRef = useRef<AuthoringDocumentBindingOwner | null>(null);
  if (!ownerRef.current || !Object.is(ownerRef.current.source, source)) {
    ownerRef.current = new AuthoringDocumentBindingOwner({ source, artifact });
  }
  const owner = ownerRef.current;
  useSyncExternalStore(owner.subscribe, owner.getSnapshot, owner.getSnapshot);
  return owner;
}

function ownArtifact(artifact: SaveableScaffoldArtifact): SaveableScaffoldArtifact {
  return deepFreeze(structuredClone(artifact));
}

function ownContent(content: JSONContent): JSONContent {
  return deepFreeze(structuredClone(content));
}

function replaceArtifactTitle(
  artifact: SaveableScaffoldArtifact,
  title: string,
): SaveableScaffoldArtifact {
  return Object.freeze({ ...artifact, title });
}

function cloneSnapshot(snapshot: AuthoringDocumentSnapshot): AuthoringDocumentSnapshot {
  return deepFreeze({ revision: snapshot.revision, artifact: structuredClone(snapshot.artifact) });
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => valuesEqual(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => Object.hasOwn(rightRecord, key) && valuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function deepFreeze<Value>(value: Value, visited = new WeakSet<object>()): Value {
  if (value === null || typeof value !== "object" || visited.has(value)) return value;
  visited.add(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  return Object.freeze(value);
}

function readPersistedCourseThemeFromContent(content: JSONContent): PersistedCourseTheme | null {
  const attrs = CourseDocumentAttrsSchema.safeParse(content.content?.[0]?.attrs);
  return attrs.success ? deepFreeze(attrs.data.theme) : null;
}

function readPersistedCourseThemeFromEditor(editor: TiptapEditor): PersistedCourseTheme | null {
  const theme = editor.state.doc.firstChild?.attrs["theme"];
  const parsed = PersistedCourseThemeSchema.safeParse(theme);
  return parsed.success ? deepFreeze(parsed.data) : null;
}
