"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A drawn signature, posted as a data URL beside the typed name.
 *
 * A canvas has no file to submit, so the drawing goes into a hidden field and
 * the server decodes it through `decodeImageDataUrl()` with the same caps as any
 * upload. Pointer events cover a mouse, a finger and a stylus with one set of
 * handlers, and `touch-action: none` is what stops a phone scrolling the page
 * while somebody signs it.
 *
 * The typed name is the part that is required. A drawing is what a person
 * recognises as signing; a name is what makes the record legible a year later,
 * and a trackpad squiggle is not worth blocking somebody's booking over.
 */
export default function SignaturePad({ name = "signature", nameField = "signedName" }: {
  name?: string;
  nameField?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenRef = useRef<HTMLInputElement | null>(null);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(false);

  // The canvas is sized in device pixels to whatever width it is given, so the
  // stroke is not a blurry upscale on a phone.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1c1917";
  }, []);

  function positionOf(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = positionOf(event);
    context.beginPath();
    context.moveTo(x, y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = positionOf(event);
    context.lineTo(x, y);
    context.stroke();
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !hiddenRef.current) return;
    hiddenRef.current.value = canvas.toDataURL("image/png");
    setDrawn(true);
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (hiddenRef.current) hiddenRef.current.value = "";
    setDrawn(false);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="block text-stone-500 mb-1">Full name</span>
        <input
          name={nameField}
          required
          autoComplete="name"
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
        />
      </label>
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-stone-500">
            Signature <span className="text-stone-400">(optional)</span>
          </span>
          {drawn && (
            <button type="button" onClick={clear} className="text-xs font-semibold text-stone-500 hover:underline">
              Clear
            </button>
          )}
        </div>
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          aria-label="Sign here"
          className="mt-1 h-32 w-full touch-none rounded-lg border border-dashed border-stone-300 bg-white"
        />
      </div>
      <input ref={hiddenRef} type="hidden" name={name} />
    </div>
  );
}
