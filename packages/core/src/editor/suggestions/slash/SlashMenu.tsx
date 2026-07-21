import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

import { cn } from "@/lib/cn";

import type { SlashItem } from "../insert/items";

import "./slash-menu.css";

export interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

function slashMenuOptionId(itemId: string): string {
  return `slash-menu-option-${itemId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu(
  { items, command },
  ref,
) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectedItem = items[selectedIdx];

  useEffect(() => {
    setSelectedIdx(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (items.length === 0) return false;

      if (event.key === "ArrowUp") {
        setSelectedIdx((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIdx((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Home") {
        setSelectedIdx(0);
        return true;
      }
      if (event.key === "End") {
        setSelectedIdx(items.length - 1);
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selectedIdx];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div role="status" aria-live="polite" className="sc-slash-menu-empty">
        No block matches
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Insert block"
      aria-activedescendant={selectedItem ? slashMenuOptionId(selectedItem.id) : undefined}
      className="sc-slash-menu"
    >
      {items.map((item, idx) => (
        <button
          key={item.id}
          id={slashMenuOptionId(item.id)}
          type="button"
          role="option"
          aria-label={item.title}
          aria-selected={idx === selectedIdx}
          aria-describedby={`${slashMenuOptionId(item.id)}-description`}
          onClick={() => command(item)}
          onMouseEnter={() => setSelectedIdx(idx)}
          className={cn("sc-slash-menu-item", idx === selectedIdx && "is-selected")}
        >
          <div className="sc-slash-menu-item-title">{item.title}</div>
          <div
            id={`${slashMenuOptionId(item.id)}-description`}
            className="sc-slash-menu-item-description"
          >
            {item.description}
          </div>
        </button>
      ))}
    </div>
  );
});
