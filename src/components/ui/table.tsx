import { ReactNode } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="bg-gray-50">{children}</thead>;
}

export function TableHeaderCell({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 font-medium text-gray-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-gray-200">{children}</tbody>;
}

export function TableRow({ children }: { children: ReactNode }) {
  return <tr className="transition-colors hover:bg-gray-50">{children}</tr>;
}

export function TableCell({
  children,
  align = "left",
  emphasis = false,
}: {
  children: ReactNode;
  align?: "left" | "right";
  emphasis?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 align-middle ${
        align === "right" ? "text-right" : "text-left"
      } ${emphasis ? "font-medium text-gray-900" : "text-gray-600"}`}
    >
      {children}
    </td>
  );
}
