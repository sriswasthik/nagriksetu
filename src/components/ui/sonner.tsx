"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * App-wide toast host, themed to the CityTrace palette via the
 * shared design tokens. Mounted once in the root layout.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "!rounded-lg !border !border-border !bg-card !text-card-foreground !shadow-lg !font-sans",
          title: "!text-sm !font-semibold",
          description: "!text-sm !text-muted-foreground",
          actionButton:
            "!rounded-md !bg-primary !text-primary-foreground !text-xs !font-medium",
          cancelButton:
            "!rounded-md !bg-muted !text-muted-foreground !text-xs !font-medium",
          success: "!text-emerald-800",
          error: "!text-destructive",
        },
      }}
    />
  );
}
