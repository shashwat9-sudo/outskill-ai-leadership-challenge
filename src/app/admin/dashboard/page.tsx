import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/admin-shell';
import { DashboardView } from '@/components/admin/dashboard-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Dashboard' };

export default function AdminDashboardPage() {
  return (
    <AdminShell>
      <DashboardView />
    </AdminShell>
  );
}
