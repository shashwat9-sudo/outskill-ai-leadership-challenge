import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/admin-shell';
import { SettingsView } from '@/components/admin/settings-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Settings' };

export default function AdminSettingsPage() {
  return (
    <AdminShell>
      <SettingsView />
    </AdminShell>
  );
}
