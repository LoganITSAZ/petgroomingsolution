"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/lib/photos";

/**
 * A photo with a way to change it. Optional everywhere: no photo simply shows
 * initials, and "Remove" clears it.
 */
export default function PhotoUpload({
  action,
  idField,
  idValue,
  currentUrl,
  label,
  size = 72,
}: {
  action: (formData: FormData) => Promise<void>;
  idField: string;
  idValue: string;
  currentUrl: string | null;
  label: string;
  size?: number;
}) {
  const initials = label
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const previewUrl = selectedFile ? URL.createObjectURL(selectedFile) : currentUrl;

    useEffect(() => {
      return () => {
        if (selectedFile && previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [selectedFile, previewUrl]);

  function attachFiles(files: FileList | File[] | null) {
    const file = files?.[0];
    if (!file) {
      setStatus(null);
      setSelectedFile(null);
      return;
    }

    if (file.size === 0) {
      setStatus(null);
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setSelectedFile(null);
      setStatus({ kind: "error", message: "Use a JPG, PNG or WebP image under 2 MB." });
      return;
    }

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setSelectedFile(null);
      setStatus({ kind: "error", message: "Use a JPG, PNG or WebP image under 2 MB." });
      return;
    }

    setSelectedFile(file);
    setStatus({ kind: "success", message: "Ready to upload" });

    if (inputRef.current) {
      try {
        Object.defineProperty(inputRef.current, "files", {
          configurable: true,
          value: [file],
              writable: true,
        });
      } catch {
        // Some browsers do not expose a writable `files` property; the form still
        // submits the selected file through the native input.
      }
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    attachFiles(event.target.files);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    attachFiles(event.dataTransfer?.files ?? null);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }

  return (
    <div className="group relative">
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={label}
          className="rounded-xl object-cover border border-stone-200"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          className="rounded-xl border border-stone-200 bg-stone-100 text-stone-500 font-bold flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          {initials}
        </span>
      )}

      {/* Expanded preview on hover, absolutely positioned so nothing moves. */}
      {previewUrl && (
        <span className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden group-hover:block bg-white border border-stone-200 rounded-xl p-2 shadow-xl">
          <img src={previewUrl} alt={label} className="w-56 h-56 rounded-lg object-cover" />
        </span>
      )}

      <form action={action} encType="multipart/form-data" className="mt-1.5 flex items-center gap-2">
        <input type="hidden" name={idField} value={idValue} />
        {/* `sr-only`, never `hidden`: `display:none` takes the input out of the
            tab order, and the label around it is not focusable on its own, so
            the only way to a photo was the mouse. Off-screen keeps the input
            focusable and `focus-within` paints the ring on the label the
            keyboard user can actually see. */}
        <label
          className="rounded px-0.5 text-[11px] font-semibold text-amber-700 hover:text-amber-900 cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {currentUrl || selectedFile ? "Change" : "Add photo"}
          <input
            ref={inputRef}
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={handleInputChange}
          />
        </label>
        <button type="submit" className="text-[11px] font-semibold text-stone-500 hover:text-stone-800">
          Save
        </button>
        {currentUrl && (
          <button
            type="submit"
            name="remove"
            value="1"
            className="text-[11px] text-stone-400 hover:text-red-600"
          >
            Remove
          </button>
        )}
      </form>

      {status && (
        <p
          aria-live="polite"
          className={
            status.kind === "success"
              ? "mt-1 text-[11px] text-emerald-700"
              : "mt-1 text-[11px] text-red-600"
          }
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
