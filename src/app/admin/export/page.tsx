import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/admin-shell';
import { ExportView } from '@/components/admin/export-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Export' };

export default function AdminExportPage() {
  return (
    <AdminShell>
      <ExportView />
    </AdminShell>
  );
}
