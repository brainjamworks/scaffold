import { FullColorPicker, HighlightColorPicker } from "@/ui/components/ColorPicker/ColorPicker";

import { preserveRichTextSelection } from "./rich-text-popover-behavior";
import type { RichTextColorOption } from "./rich-text-color-options";

interface RichTextFullColorPickerProps {
  currentValue: string;
  fallbackColor: string;
  palette: ReadonlyArray<RichTextColorOption>;
  onChange: (value: string) => void;
  onReset: () => void;
}

/**
 * Text-colour picker — curated swatch row with a header reset, and
 * a quiet "Custom" disclosure that reveals a single hex input.
 *
 * No HSB area, no hue slider — surveyed against Notion / Craft /
 * Coda / Substack / Novel / Ghost in 2026, every editorial tool
 * whose voice matches scaffold's ("calm work surface, considered,
 * literate") ships exactly this shape. Full HSB pickers appear only
 * in demo playgrounds and design tools; in a text editor they invite
 * arbitrary off-brand colour and dilute the triple-in-reserve rule.
 */
export function RichTextFullColorPicker({
  currentValue,
  fallbackColor,
  palette,
  onChange,
  onReset,
}: RichTextFullColorPickerProps) {
  return (
    <FullColorPicker
      currentValue={currentValue}
      fallbackColor={fallbackColor}
      label="Colour"
      labelSuffix="text"
      palette={palette}
      resetLabel="Reset to default"
      resetAriaLabel="Use default text colour"
      customHint="Enter a hex colour, for example #161D77."
      onChange={onChange}
      onControlMouseDown={preserveRichTextSelection}
      onReset={onReset}
    />
  );
}

interface RichTextHighlightPickerProps {
  currentValue: string;
  options: ReadonlyArray<RichTextColorOption>;
  onSelect: (value: string) => void;
  onReset: () => void;
}

/**
 * Highlight picker — header with "None" reset, single-row swatch
 * grid. Notion-anchored palette gives real visible colour on white
 * (no more "faded" complaint); the swatch hairline lives on the
 * swatch only so the applied highlight in the document stays
 * borderless (WYSIWYG).
 */
export function RichTextHighlightPicker({
  currentValue,
  options,
  onSelect,
  onReset,
}: RichTextHighlightPickerProps) {
  return (
    <HighlightColorPicker
      currentValue={currentValue}
      label="Highlight"
      labelSuffix="highlight"
      options={options}
      resetLabel="None"
      resetAriaLabel="Remove highlight"
      onControlMouseDown={preserveRichTextSelection}
      onReset={onReset}
      onSelect={onSelect}
    />
  );
}
