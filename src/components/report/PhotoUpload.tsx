"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MAX_SIZE = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

interface PhotoUploadProps {
  file: File | null;
  previewUrl: string | null;
  onSelect: (file: File, previewUrl: string) => void;
  onClear: () => void;
  disabled?: boolean;
  /** Upload progress 0-100, shown while submitting. */
  progress?: number | null;
}

/**
 * Evidence photo picker.
 *
 * Preserves the original component's hard-won mobile behaviour:
 *  - A ref-driven click instead of <label htmlFor>, which was
 *    unreliable across iOS/Android browsers.
 *  - Clearing input.value before opening, so re-picking the SAME
 *    file still fires onChange.
 *  - Extension fallback for devices that report an empty MIME type.
 *
 * Adds drag-and-drop on pointer devices and inline validation.
 */
export function PhotoUpload({
  file,
  previewUrl,
  onSelect,
  onClear,
  disabled,
  progress,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Release the object URL when the preview changes or unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function openPicker() {
    if (disabled) return;

    if (inputRef.current) {
      // Reset so selecting the same image again still triggers change.
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }

  function validateAndAccept(candidate: File) {
    setError(null);

    const extension = candidate.name.split(".").pop()?.toLowerCase() || "";
    const isImage =
      candidate.type.startsWith("image/") ||
      ALLOWED_EXTENSIONS.includes(extension);

    if (!isImage) {
      setError("That file isn't an image. Please choose a JPG, PNG, WEBP or HEIC photo.");
      return;
    }

    if (candidate.size <= 0) {
      setError("That image appears to be empty. Please choose another.");
      return;
    }

    if (candidate.size > MAX_SIZE) {
      setError(
        `That photo is ${(candidate.size / 1024 / 1024).toFixed(1)} MB. Please choose one under 10 MB.`
      );
      return;
    }

    onSelect(candidate, URL.createObjectURL(candidate));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const candidate = event.target.files?.[0];
    if (candidate) validateAndAccept(candidate);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const candidate = event.dataTransfer.files?.[0];
    if (candidate) validateAndAccept(candidate);
  }

  const isUploading = typeof progress === "number" && progress < 100;

  return (
    <div>
      {/* The real input stays in the DOM and keeps its own label. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        capture="environment"
        onChange={handleChange}
        disabled={disabled}
        className="sr-only"
        aria-label="Choose a photo of the issue"
      />

      {!previewUrl ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "rounded-xl border-2 border-dashed p-6 transition-colors sm:p-8",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/25"
          )}
        >
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Camera className="h-7 w-7" aria-hidden="true" />
            </span>

            <p className="text-sm font-semibold text-foreground">
              Add a photo of the issue
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              A clear photo helps the right team turn up with the right
              equipment.
              <span className="hidden sm:inline"> Drag one here, or…</span>
            </p>

            <div className="mt-5 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
              <Button
                type="button"
                onClick={openPicker}
                disabled={disabled}
                className="w-full sm:w-auto"
              >
                <Camera className="mr-1 h-4 w-4" aria-hidden="true" />
                Take photo
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={openPicker}
                disabled={disabled}
                className="w-full sm:w-auto"
              >
                <ImagePlus className="mr-1 h-4 w-4" aria-hidden="true" />
                Choose from device
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              JPG, PNG, WEBP or HEIC · up to 10 MB
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="relative bg-neutral-900">
            {/* Object URL preview — next/image cannot optimise blob: URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="The photo you selected as evidence for this report"
              className="max-h-80 w-full object-contain"
            />

            {!disabled && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClear}
                className="absolute right-3 top-3 shadow-md"
              >
                <X className="mr-1 h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            )}

            {isUploading && (
              <div className="absolute inset-x-0 bottom-0 bg-neutral-900/85 px-4 py-3 backdrop-blur-sm">
                <div className="flex items-center gap-2.5 text-xs font-medium text-white">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Uploading photo…
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-primary-300 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 bg-muted/30 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {file?.name || "Selected photo"}
              </p>
              {file && (
                <p className="tabular text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openPicker}
              disabled={disabled}
              className="shrink-0"
            >
              Replace
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
