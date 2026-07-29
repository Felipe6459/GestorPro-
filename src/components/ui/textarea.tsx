import { TextareaHTMLAttributes } from "react";

export function Textarea({
  className = "",
  "aria-invalid": ariaInvalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const invalid = ariaInvalid === true || ariaInvalid === "true";
  return (
    <textarea
      aria-invalid={ariaInvalid}
      className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ${
        invalid
          ? "border-red-400 focus:border-red-500 focus:ring-red-500"
          : "border-gray-300 focus:border-black focus:ring-black"
      } ${className}`}
      {...props}
    />
  );
}
