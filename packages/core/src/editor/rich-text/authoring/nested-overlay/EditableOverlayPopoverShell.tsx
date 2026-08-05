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
  CoursePopoverAction,
  CoursePopoverPager,
  CoursePopoverPagerAction,
  type CoursePopoverActionProps,
  type CoursePopoverActionTone,
  type CoursePopoverPagerProps,
} from "@/ui/components/course/CoursePopoverSurface/CoursePopoverActions";
import {
  CoursePopoverSurface,
  type CoursePopoverSurfaceTone,
} from "@/ui/components/course/CoursePopoverSurface/CoursePopoverSurface";
import {
  EditorFloatingPopover,
  type EditorFloatingPopoverContentProps,
} from "@/editor/interactions/floating/EditorFloatingPopover";
import { AUTHORING_CHROME_SUPPRESSION_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import { cn } from "@/lib/cn";
import { CourseThemePortalBoundary } from "@/theme/course/CourseThemeProvider";

import {
  NestedRichTextEditorField,
  type NestedRichTextEditorFieldConfig,
} from "./NestedRichTextEditorField";

export type EditableOverlayPopoverTone = CoursePopoverSurfaceTone;

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

export type EditableOverlayPopoverTextActionTone = CoursePopoverActionTone;
export type EditableOverlayPopoverTextActionProps = CoursePopoverActionProps;

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
      className={cn("sc-course-popover-surface__arrow", className)}
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
    <CourseThemePortalBoundary>
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
        <CoursePopoverSurface
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
        </CoursePopoverSurface>
      </EditorFloatingPopover.Content>
    </CourseThemePortalBoundary>
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

export const EditableOverlayPopoverTextAction = CoursePopoverAction;
export const EditableOverlayPopoverPager = CoursePopoverPager;
export type EditableOverlayPopoverPagerProps = CoursePopoverPagerProps;
export const EditableOverlayPopoverPagerAction = CoursePopoverPagerAction;

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
