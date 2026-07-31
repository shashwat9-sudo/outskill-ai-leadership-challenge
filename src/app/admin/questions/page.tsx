import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/admin-shell';
import { QuestionsView } from '@/components/admin/questions-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Questions' };

export default function AdminQuestionsPage() {
  return (
    <AdminShell>
      <QuestionsView />
    </AdminShell>
  );
}
