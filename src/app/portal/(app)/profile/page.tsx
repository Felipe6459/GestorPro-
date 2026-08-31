import { getCurrentPortalUser } from "@/lib/current-portal-user";
import { getPortalClientAttachments } from "@/lib/client-portal/attachments";
import { PortalAttachmentsList } from "@/components/client-portal/portal-attachments-list";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-text-muted text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="text-text-primary mt-1 text-sm">{value}</dd>
    </div>
  );
}

// Read-only by design — a portal contact can never edit their own record
// or the Client's from here; there are no edit actions anywhere on this
// page. Uses only the identity data getCurrentPortalUser() already
// resolved, no separate Prisma query.
export default async function PortalProfilePage() {
  const { portalUser, client, clientId, organizationId } = await getCurrentPortalUser();
  const attachments = await getPortalClientAttachments(clientId, organizationId);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-text-muted mt-1 text-sm">Your Client Portal account details.</p>
      </div>

      <section className={`p-6 ${CARD_SURFACE_CLASSES}`}>
        <h2 className="text-text-primary text-sm font-semibold">Your details</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" value={portalUser.name} />
          <Field label="Email" value={portalUser.email} />
        </dl>
      </section>

      <section className={`p-6 ${CARD_SURFACE_CLASSES}`}>
        <h2 className="text-text-primary text-sm font-semibold">Client</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Client name" value={client.name} />
          <Field label="Company" value={client.company} />
          <Field label="Email" value={client.email} />
          <Field label="Phone" value={client.phone} />
        </dl>
      </section>

      <section className={`p-6 ${CARD_SURFACE_CLASSES}`}>
        <h2 className="text-text-primary text-sm font-semibold">Shared files</h2>
        <PortalAttachmentsList
          attachments={attachments}
          emptyDescription="Files your team shares with you will appear here."
        />
      </section>
    </div>
  );
}
