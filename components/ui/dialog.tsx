"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogPortal = D.Portal;
export const DialogClose = D.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof D.Overlay>,
  React.ComponentPropsWithoutRef<typeof D.Overlay>
>(({ className, ...props }, ref) => (
  <D.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-on-background/20 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = D.Overlay.displayName;

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof D.Content> {
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  overlayClassName?: string;
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof D.Content>,
  DialogContentProps
>(({ children, className, onCloseAutoFocus, initialFocusRef, overlayClassName, onOpenAutoFocus, ...props }, ref) => (
  <D.Portal>
    <DialogOverlay className={overlayClassName} />
    <D.Content
      ref={ref}
      {...props}
      onOpenAutoFocus={(e) => {
        onOpenAutoFocus?.(e);
        if (e.defaultPrevented) return;
        if (initialFocusRef?.current) {
          e.preventDefault();
          initialFocusRef.current.focus();
        }
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-surface border border-outline-variant shadow-2xl rounded-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] motion-reduce:animate-none duration-200",
        className
      )}
    >
      {children}
    </D.Content>
  </D.Portal>
));
DialogContent.displayName = D.Content.displayName;

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
      {...props}
    />
  );
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof D.Title>,
  React.ComponentPropsWithoutRef<typeof D.Title>
>(({ className, ...props }, ref) => (
  <D.Title
    ref={ref}
    className={cn("font-headline-sm text-headline-sm text-on-surface leading-tight tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = D.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof D.Description>,
  React.ComponentPropsWithoutRef<typeof D.Description>
>(({ className, ...props }, ref) => (
  <D.Description
    ref={ref}
    className={cn("text-body-md text-on-surface-variant text-sm", className)}
    {...props}
  />
));
DialogDescription.displayName = D.Description.displayName;
