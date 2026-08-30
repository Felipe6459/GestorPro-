import { InputHTMLAttributes } from "react";
import { formControlClasses } from "@/components/ui/form-control-classes";

export function Input({
  className = "",
  "aria-invalid": ariaInvalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const invalid = ariaInvalid === true || ariaInvalid === "true";
  return (
    <input
      aria-invalid={ariaInvalid}
      className={`${formControlClasses(invalid)} ${className}`}
      {...props}
    />
  );
}
