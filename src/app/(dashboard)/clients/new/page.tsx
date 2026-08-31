import Link from "next/link";
import { ClientForm } from "@/components/clients/client-form";
import { ACTION_LINK_CLASSES } from "@/components/ui/action-link-classes";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";
import { createClientAction } from "./actions";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-text-primary text-2xl font-semibold tracking-tight">Add client</h1>
        <Link href="/clients" className={ACTION_LINK_CLASSES}>
          Cancel
        </Link>
      </div>
      <div className={`p-6 ${CARD_SURFACE_CLASSES}`}>
        <ClientForm action={createClientAction} />
      </div>
    </div>
  );
}
