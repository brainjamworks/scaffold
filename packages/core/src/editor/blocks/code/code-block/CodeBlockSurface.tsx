import { CheckIcon as Check, CopyIcon as Copy } from "@phosphor-icons/react";
import {
  CODE_BLOCK_LANGUAGE_LABELS,
  CodeBlockDataSchema,
  type CodeBlockData,
} from "@scaffold/contracts";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { CourseButton } from "@/ui/components/course/CourseActions/CourseActions";

import { emptyCodeBlockData } from "./content";

import "./CodeBlock.css";

export function parseCodeBlockData(raw: unknown): CodeBlockData {
  const parsed = CodeBlockDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyCodeBlockData();
}

export function normalizeCodeBlockData(next: Partial<CodeBlockData>): CodeBlockData {
  return CodeBlockDataSchema.parse(next);
}

export function CodeBlockSurface({
  children,
  code,
  data,
  languageControl,
}: {
  children: ReactNode;
  code: string;
  data: CodeBlockData;
  languageControl: ReactNode;
}) {
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const copyTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const copyCode = async () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    setCopyState("idle");

    try {
      await navigator.clipboard.writeText(code);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }

    copyTimer.current = window.setTimeout(() => setCopyState("idle"), 2000);
  };

  const copyMessage =
    copyState === "success"
      ? "Code copied to clipboard"
      : copyState === "error"
        ? "Could not copy code to clipboard"
        : "";

  return (
    <div className="sc-course-code-block__shell">
      <header contentEditable={false} className="sc-course-code-block__header">
        {languageControl}
        {data.showCopyButton ? (
          <>
            <CourseButton
              type="button"
              emphasis="quiet"
              className="sc-course-code-block__copy"
              data-copy-state={copyState}
              aria-label={copyState === "success" ? "Code copied to clipboard" : "Copy code"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                void copyCode();
              }}
            >
              {copyState === "success" ? (
                <>
                  <Check size={14} weight="bold" aria-hidden />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy size={14} aria-hidden />
                  <span>Copy</span>
                </>
              )}
            </CourseButton>
            <span
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="sc-course-code-block__copy-status sc-sr-only"
            >
              {copyMessage}
            </span>
          </>
        ) : null}
      </header>
      <div className={cn("sc-course-code-block__body", `language-${data.language}`)}>
        {children}
      </div>
    </div>
  );
}

export function CodeBlockLanguageLabel({ data }: { data: CodeBlockData }) {
  return (
    <span
      className="sc-course-code-block__language-label"
      aria-label={`Language: ${CODE_BLOCK_LANGUAGE_LABELS[data.language]}`}
    >
      {CODE_BLOCK_LANGUAGE_LABELS[data.language]}
    </span>
  );
}
