import * as Dialog from "@radix-ui/react-dialog";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { XIcon as X } from "@phosphor-icons/react";
import { inertOthers } from "aria-hidden";
import { RemoveScroll } from "react-remove-scroll";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
  type Ref,
} from "react";

import { CourseThemePortalBoundary } from "@/theme/course/CourseThemeProvider";
import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";
import { iconMd } from "@/ui/tokens/icon-sizes";

type ImageHotspotCourseWorkspaceRootProps = Omit<
  ComponentPropsWithoutRef<typeof Dialog.Root>,
  "modal"
>;

export function ImageHotspotCourseWorkspaceRoot(props: ImageHotspotCourseWorkspaceRootProps) {
  return <Dialog.Root {...props} modal={false} />;
}
export const ImageHotspotCourseWorkspaceTrigger = Dialog.Trigger;

function setRefValue<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export interface ImageHotspotCourseWorkspaceContentProps extends Omit<
  ComponentPropsWithoutRef<typeof Dialog.Content>,
  "aria-describedby" | "children" | "title"
> {
  children: ReactNode;
  description: ReactNode;
  open: boolean;
  title: ReactNode;
  toolbar?: ReactNode;
}

/** Course-owned expanded surface for the spatial learner experience. */
export const ImageHotspotCourseWorkspaceContent = forwardRef<
  ElementRef<typeof Dialog.Content>,
  ImageHotspotCourseWorkspaceContentProps
>(function ImageHotspotCourseWorkspaceContent(
  { children, className, description, onOpenAutoFocus, open, title, toolbar, ...contentProps },
  forwardedRef,
) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<ElementRef<typeof Dialog.Content>>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [present, setPresent] = useState(false);
  const setContentRef = useCallback(
    (value: ElementRef<typeof Dialog.Content> | null) => {
      contentRef.current = value;
      setRefValue(forwardedRef, value);
    },
    [forwardedRef],
  );

  useEffect(() => {
    if (!open) {
      setPresent(false);
      return undefined;
    }
    const timer = setTimeout(() => setPresent(true), 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!present || !contentRef.current || !overlayRef.current) return undefined;
    const portalHost = contentRef.current.parentElement;
    const isolationRoot = portalHost?.parentElement;
    if (!portalHost || !isolationRoot || overlayRef.current.parentElement !== portalHost) {
      return undefined;
    }
    return inertOthers(
      [overlayRef.current, contentRef.current],
      isolationRoot,
      "data-sc-course-image-hotspot-workspace-inert",
    );
  }, [present]);

  return (
    <Dialog.Portal forceMount>
      <CourseThemePortalBoundary>
        <div className="sc-course-image-hotspot-workspace__portal" style={{ zIndex: zIndex.modal }}>
          {present ? (
            <div
              ref={overlayRef}
              aria-hidden="true"
              className="sc-course-image-hotspot-workspace__overlay"
              data-state="open"
            />
          ) : null}
          {present ? (
            <RemoveScroll allowPinchZoom forwardProps>
              <FocusScope asChild loop trapped>
                <Dialog.Content
                  {...contentProps}
                  ref={setContentRef}
                  className={cn("sc-course-image-hotspot-workspace", className)}
                  contentEditable={false}
                  onCloseAutoFocus={(event) => {
                    contentProps.onCloseAutoFocus?.(event);
                    if (event.defaultPrevented) return;
                    event.preventDefault();
                    const opener = openerRef.current;
                    if (opener?.isConnected) opener.focus({ preventScroll: true });
                    openerRef.current = null;
                  }}
                  onFocusOutside={(event) => {
                    contentProps.onFocusOutside?.(event);
                    if (!event.defaultPrevented) event.preventDefault();
                  }}
                  onOpenAutoFocus={(event) => {
                    const activeElement = document.activeElement;
                    openerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
                    onOpenAutoFocus?.(event);
                    if (event.defaultPrevented) return;
                    event.preventDefault();
                    titleRef.current?.focus();
                  }}
                >
                  <header className="sc-course-image-hotspot-workspace__header">
                    <div className="sc-course-image-hotspot-workspace__heading">
                      <Dialog.Title
                        ref={titleRef}
                        tabIndex={-1}
                        className="sc-course-image-hotspot-workspace__title"
                      >
                        {title}
                      </Dialog.Title>
                      <Dialog.Description className="sc-course-image-hotspot-workspace__description">
                        {description}
                      </Dialog.Description>
                    </div>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label="Close expanded hotspot workspace"
                        className="sc-course-image-hotspot__icon-action"
                        data-intent="close"
                      >
                        <X size={iconMd} aria-hidden />
                      </button>
                    </Dialog.Close>
                  </header>
                  {toolbar}
                  {children}
                </Dialog.Content>
              </FocusScope>
            </RemoveScroll>
          ) : null}
        </div>
      </CourseThemePortalBoundary>
    </Dialog.Portal>
  );
});

export function ImageHotspotCourseWorkspaceToolbar({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div role="toolbar" aria-label={label} className="sc-course-image-hotspot-workspace__toolbar">
      {children}
    </div>
  );
}

export const ImageHotspotCourseAction = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    children: ReactNode;
    label: string;
    intent?: "add" | "delete" | "edit" | "replace" | "select";
  }
>(function ImageHotspotCourseAction(
  {
    children,
    className,
    intent = "edit",
    label,
    onClick,
    onMouseDown,
    onPointerDown,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn("sc-course-image-hotspot__icon-action", className)}
      data-intent={intent}
      contentEditable={false}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        onMouseDown?.(event);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
    >
      {children}
    </button>
  );
});

export const ImageHotspotCourseWorkspace = {
  Action: ImageHotspotCourseAction,
  Content: ImageHotspotCourseWorkspaceContent,
  Root: ImageHotspotCourseWorkspaceRoot,
  Toolbar: ImageHotspotCourseWorkspaceToolbar,
  Trigger: ImageHotspotCourseWorkspaceTrigger,
} as const;
