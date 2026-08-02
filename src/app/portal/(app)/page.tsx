import { getCurrentPortalUser } from "@/lib/current-portal-user";

// Proof-of-auth-foundation placeholder, not the final portal experience —
// Projects/Invoices pages come in a later stage. Deliberately uses only the
// identity data the layout already resolved via getCurrentPortalUser(), no
// separate Prisma queries of its own.
export default async function PortalHomePage() {
  const { client } = await getCurrentPortalUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Client Portal</h1>
      <p className="mt-1 text-sm text-gray-600">{client.name}</p>
      <p className="mt-6 text-sm text-gray-500">Projects and invoices will appear here.</p>
    </div>
  );
}
