import { cn } from "@/lib/utils";
import { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && <label htmlFor={id} className="block text-sm font-medium text-stone-700">{label}</label>}
      <input
        id={id}
        className={cn("w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent", error && "border-red-400", className)}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  return (
    <div className="space-y-1">
      {label && <label htmlFor={id} className="block text-sm font-medium text-stone-700">{label}</label>}
      <textarea
        id={id}
        className={cn("w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent", error && "border-red-400", className)}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
