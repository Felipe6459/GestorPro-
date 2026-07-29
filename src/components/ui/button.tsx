import { ButtonHTMLAttributes } from "react";
import { SpinnerIcon } from "@/components/ui/icons";

export function Button({
  className = "",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <SpinnerIcon className="h-4 w-4" />}
      {children}
    </button>
  );
}
