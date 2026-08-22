import {
  forwardRef,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type Ref,
  type ReactNode,
} from "react";

import {
  EditorFloatingPopover,
  type EditorFloatingPopoverContentProps,
} from "@/editor/interactions/floating/EditorFloatingPopover";
import { AUTHORING_CHROME_SUPPRESSION_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import { cn } from "@/lib/cn";

import {
  NestedRichTextEditorField,
  type NestedRichTextEditorFieldConfig,
} from "./NestedRichTextEditorField";
import "./editable-overlay-popover.css";

export type EditableOverlayPopoverTone = "annotation" | "feedback" | "hint" | "neutral";

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
export interface EditableOverlayPopoverTextActionProps extends Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "className" | "style" | "type"
> {
  children: ReactNode;
  tone?: EditableOverlayPopoverTextActionTone;
}

export interface EditableOverlayPopoverPagerProps extends Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "className" | "style"
> {
  children: ReactNode;
}

export interface EditableOverlayPopoverPagerActionProps extends Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "className" | "style" | "type"
> {
  children: ReactNode;
}

export const EditableOverlayPopoverRoot = EditorFloatingPopover.Root;
export const EditableOverlayPopoverTrigger = EditorFloatingPopover.Trigger;
export const EditableOverlayPopoverAnchor = EditorFloatingPopover.Anchor;
export const EditableOverlayPopoverPortal = EditorFloatingPopover.Portal;
export const EditableOverlayPopoverClose = EditorFloatingPopover.Close;
export const EditableOverlayPopoverArrow = forwardRef<
  ElementRef<typeof EditorFloatingPopover.Arrow>,
  ComponentPropsWithoutRef<typeof EditorFloatingPopover.Arrow>
>(function EditableOverlayPopoverArrow({ className, ...props }, ref) {
  return (
    <EditorFloatingPopover.Arrow
      {...props}
      ref={ref}
      className={cn("sc-app-editable-overlay-popover__arrow", className)}
    />
  );
});

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
      {...{ [AUTHORING_CHROME_SUPPRESSION_ATTR]: "" }}
      side={side}
      sideOffset={sideOffset}
      className={className}
    >
      <div
        className="sc-app-editable-overlay-popover"
        data-scaffold-popover-surface=""
        data-owner="app"
        data-tone={tone}
      >
        <header
          className="sc-app-editable-overlay-popover__header"
          data-slot="popover-surface-header"
        >
          {icon ? (
            <span className="sc-app-editable-overlay-popover__icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div className="sc-app-editable-overlay-popover__heading">
            <div className="sc-app-editable-overlay-popover__title-row">
              <h2 id={titleId} className="sc-app-editable-overlay-popover__title">
                {title}
              </h2>
              {meta ? (
                <span className="sc-app-editable-overlay-popover__meta">{meta}</span>
              ) : null}
            </div>
            {description ? (
              <p id={descriptionId} className="sc-app-editable-overlay-popover__description">
                {description}
              </p>
            ) : null}
          </div>
          {headerActions ? (
            <div className="sc-app-editable-overlay-popover__header-actions">
              {headerActions}
            </div>
          ) : null}
        </header>

        <div
          ref={bodyRef}
          className="sc-app-editable-overlay-popover__body"
          data-slot="popover-surface-body"
        >
          {children}
        </div>

        {footerStart || footerEnd ? (
          <footer
            className="sc-app-editable-overlay-popover__footer"
            data-slot="popover-surface-footer"
          >
            {footerStart ? (
              <div className="sc-app-editable-overlay-popover__footer-start">{footerStart}</div>
            ) : null}
            {footerEnd ? (
              <div className="sc-app-editable-overlay-popover__footer-end">{footerEnd}</div>
            ) : null}
          </footer>
        ) : null}
      </div>
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
  { children, tone = "default", ...buttonProps },
  forwardedRef,
) {
  return (
    <button
      ref={forwardedRef}
      {...buttonProps}
      type="button"
      className="sc-app-editable-overlay-popover__text-action"
      data-tone={tone}
    >
      {children}
    </button>
  );
});

export const EditableOverlayPopoverPager = forwardRef<
  HTMLDivElement,
  EditableOverlayPopoverPagerProps
>(function EditableOverlayPopoverPager({ children, role = "group", ...groupProps }, forwardedRef) {
  return (
    <div
      ref={forwardedRef}
      {...groupProps}
      role={role}
      className="sc-app-editable-overlay-popover__pager"
    >
      {children}
    </div>
  );
});

export const EditableOverlayPopoverPagerAction = forwardRef<
  HTMLButtonElement,
  EditableOverlayPopoverPagerActionProps
>(function EditableOverlayPopoverPagerAction({ children, ...buttonProps }, forwardedRef) {
  return (
    <button
      ref={forwardedRef}
      {...buttonProps}
      type="button"
      className="sc-app-editable-overlay-popover__pager-action"
    >
      {children}
    </button>
  );
});

export const EditableOverlayPopover = {
  Anchor: EditableOverlayPopoverAnchor,
  Arrow: EditableOverlayPopoverArrow,
  Close: EditableOverlayPopoverClose,
  Content: EditableOverlayPopoverContent,
  Pager: EditableOverlayPopoverPager,
  PagerAction: EditableOverlayPopoverPagerAction,
  Portal: EditableOverlayPopoverPortal,
  Root: EditableOverlayPopoverRoot,
  Shell: EditableOverlayPopoverShell,
  TextAction: EditableOverlayPopoverTextAction,
  Trigger: EditableOverlayPopoverTrigger,
} as const;
