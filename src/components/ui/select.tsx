import { SelectHTMLAttributes } from "react";
import { formControlClasses } from "@/components/ui/form-control-classes";

export function Select({
  className = "",
  "aria-invalid": ariaInvalid,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const invalid = ariaInvalid === true || ariaInvalid === "true";
  return (
    <select
      aria-invalid={ariaInvalid}
      className={`${formControlClasses(invalid)} ${className}`}
      {...props}
    />
  );
}
