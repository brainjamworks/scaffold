import { CheckIcon as Check, CopyIcon as Copy } from "@phosphor-icons/react";
import {
  CODE_BLOCK_LANGUAGE_LABELS,
  CodeBlockDataSchema,
  type CodeBlockData,
} from "@scaffold/contracts";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

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
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="sc-code-block__shell">
      <header contentEditable={false} className="sc-code-block__header">
        {languageControl}
        {data.showCopyButton ? (
          <button
            type="button"
            className="sc-code-block__copy"
            aria-label={copied ? "Copied to clipboard" : "Copy code"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              void copyCode();
            }}
          >
            {copied ? (
              <>
                <Check size={12} weight="bold" aria-hidden />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy size={12} aria-hidden />
                <span>Copy</span>
              </>
            )}
          </button>
        ) : null}
      </header>
      <div className={cn("sc-code-block__body", `language-${data.language}`)}>{children}</div>
    </div>
  );
}

export function CodeBlockLanguageLabel({ data }: { data: CodeBlockData }) {
  return (
    <span
      className="sc-code-block__language-static"
      aria-label={`Language: ${CODE_BLOCK_LANGUAGE_LABELS[data.language]}`}
    >
      {CODE_BLOCK_LANGUAGE_LABELS[data.language]}
    </span>
  );
}
