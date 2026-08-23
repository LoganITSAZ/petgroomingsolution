import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

const variantClasses = {
  primary: "bg-amber-700 hover:bg-amber-800 text-white",
  secondary: "bg-white hover:bg-stone-50 text-stone-700 border border-stone-200",
  danger: "bg-red-600 hover:bg-red-700 text-white",
  ghost: "hover:bg-stone-100 text-stone-600",
};

const sizeClasses = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({ variant = "primary", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn("font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed", variantClasses[variant], sizeClasses[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
