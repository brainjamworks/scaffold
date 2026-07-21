import {
  forwardRef,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type Ref,
  type ReactNode,
} from "react";

import {
  PopoverSurface,
  type PopoverSurfaceTone,
} from "@/ui/components/PopoverSurface/PopoverSurface";
import {
  EditorFloatingPopover,
  type EditorFloatingPopoverContentProps,
} from "@/editor/interactions/floating/EditorFloatingPopover";
import { cn } from "@/lib/cn";

import {
  NestedRichTextEditorField,
  type NestedRichTextEditorFieldConfig,
} from "./NestedRichTextEditorField";

export type EditableOverlayPopoverTone = PopoverSurfaceTone;

export interface EditableOverlayPopoverShellProps extends Omit<
  EditorFloatingPopoverContentProps,
  "children" | "className" | "title"
> {
  bodyRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  footerEnd?: ReactNode;
  footerStart?: ReactNode;
  headerActions?: ReactNode;
  icon?: ReactNode;
  meta?: ReactNode;
  title: ReactNode;
  tone?: EditableOverlayPopoverTone;
}

export type EditableOverlayPopoverEditorConfig = NestedRichTextEditorFieldConfig;

export type EditableOverlayPopoverContentProps =
  | (EditableOverlayPopoverShellProps & {
      editor?: undefined;
    })
  | (Omit<EditableOverlayPopoverShellProps, "bodyRef" | "children"> & {
      children?: never;
      editor: EditableOverlayPopoverEditorConfig;
    });

export type EditableOverlayPopoverTextActionTone = "default" | "danger";

export interface EditableOverlayPopoverTextActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: EditableOverlayPopoverTextActionTone;
}

export const EditableOverlayPopoverRoot = EditorFloatingPopover.Root;
export const EditableOverlayPopoverTrigger = EditorFloatingPopover.Trigger;
export const EditableOverlayPopoverAnchor = EditorFloatingPopover.Anchor;
export const EditableOverlayPopoverPortal = EditorFloatingPopover.Portal;
export const EditableOverlayPopoverClose = EditorFloatingPopover.Close;
export const EditableOverlayPopoverArrow = EditorFloatingPopover.Arrow;

export const EditableOverlayPopoverShell = forwardRef<
  HTMLDivElement,
  EditableOverlayPopoverShellProps
>(function EditableOverlayPopoverShell(
  {
    align = "start",
    "aria-describedby": ariaDescribedBy,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    authoringChrome = true,
    bodyRef,
    children,
    className,
    description,
    footerEnd,
    footerStart,
    headerActions,
    icon,
    meta,
    role = "dialog",
    side = "bottom",
    sideOffset = 8,
    title,
    tone = "neutral",
    ...contentProps
  },
  ref,
) {
  const titleId = useId();
  const descriptionId = useId();
  const labelledBy = ariaLabelledBy ?? (ariaLabel ? undefined : titleId);
  const describedBy = ariaDescribedBy ?? (description ? descriptionId : undefined);

  return (
    <EditorFloatingPopover.Content
      {...contentProps}
      ref={ref}
      role={role}
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
      {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
      {...(describedBy ? { "aria-describedby": describedBy } : {})}
      align={align}
      authoringChrome={authoringChrome}
      contentEditable={false}
      side={side}
      sideOffset={sideOffset}
      className={className}
    >
      <PopoverSurface
        {...(bodyRef ? { bodyRef } : {})}
        description={description}
        descriptionId={descriptionId}
        footerEnd={footerEnd}
        footerStart={footerStart}
        headerActions={headerActions}
        icon={icon}
        meta={meta}
        title={title}
        titleId={titleId}
        tone={tone}
      >
        {children}
      </PopoverSurface>
    </EditorFloatingPopover.Content>
  );
});

export const EditableOverlayPopoverContent = forwardRef<
  HTMLDivElement,
  EditableOverlayPopoverContentProps
>(function EditableOverlayPopoverContent(props, ref) {
  if (props.editor) {
    return <EditableOverlayPopoverEditorContent {...props} ref={ref} />;
  }

  const { editor: _editor, ...shellProps } = props;
  return <EditableOverlayPopoverShell {...shellProps} ref={ref} />;
});

const EditableOverlayPopoverEditorContent = forwardRef<
  HTMLDivElement,
  Omit<EditableOverlayPopoverShellProps, "bodyRef" | "children"> & {
    editor: EditableOverlayPopoverEditorConfig;
  }
>(function EditableOverlayPopoverEditorContent(
  { editor: editorConfig, onOpenAutoFocus, ...shellProps },
  ref,
) {
  const popoverBodyRef = useRef<HTMLDivElement>(null);
  const [autoFocusEditor, setAutoFocusEditor] = useState(true);

  return (
    <EditableOverlayPopoverShell
      {...shellProps}
      ref={ref}
      bodyRef={popoverBodyRef}
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event);
        setAutoFocusEditor(!event.defaultPrevented);
        event.preventDefault();
      }}
    >
      <NestedRichTextEditorField
        {...editorConfig}
        autoFocus={autoFocusEditor}
        bubbleMenuAppendTo={() => popoverBodyRef.current}
      />
    </EditableOverlayPopoverShell>
  );
});

export const EditableOverlayPopoverTextAction = forwardRef<
  HTMLButtonElement,
  EditableOverlayPopoverTextActionProps
>(function EditableOverlayPopoverTextAction(
  { children, className, tone = "default", type = "button", ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      data-tone={tone}
      className={cn("sc-popover-surface__text-action", className)}
    >
      {children}
    </button>
  );
});

export const EditableOverlayPopoverPager = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div">
>(function EditableOverlayPopoverPager({ children, className, ...props }, ref) {
  return (
    <div {...props} ref={ref} className={cn("sc-popover-surface__pager", className)}>
      {children}
    </div>
  );
});

export const EditableOverlayPopover = {
  Anchor: EditableOverlayPopoverAnchor,
  Arrow: EditableOverlayPopoverArrow,
  Close: EditableOverlayPopoverClose,
  Content: EditableOverlayPopoverContent,
  Pager: EditableOverlayPopoverPager,
  Portal: EditableOverlayPopoverPortal,
  Root: EditableOverlayPopoverRoot,
  Shell: EditableOverlayPopoverShell,
  TextAction: EditableOverlayPopoverTextAction,
  Trigger: EditableOverlayPopoverTrigger,
} as const;
