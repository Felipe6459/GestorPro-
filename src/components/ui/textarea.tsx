import { TextareaHTMLAttributes, Ref } from "react";
import { formControlClasses } from "@/components/ui/form-control-classes";

export function Textarea({
  ref,
  className = "",
  "aria-invalid": ariaInvalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  const invalid = ariaInvalid === true || ariaInvalid === "true";
  return (
    <textarea
      ref={ref}
      aria-invalid={ariaInvalid}
      className={`${formControlClasses(invalid)} ${className}`}
      {...props}
    />
  );
}
