import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/admin-shell';
import { ParticipantsView } from '@/components/admin/participants-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Participants' };

export default function AdminParticipantsPage() {
  return (
    <AdminShell>
      <ParticipantsView />
    </AdminShell>
  );
}
