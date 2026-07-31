import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminLeaderboardView } from '@/components/admin/admin-leaderboard-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Leaderboard & verification' };

export default function AdminLeaderboardPage() {
  return (
    <AdminShell>
      <AdminLeaderboardView />
    </AdminShell>
  );
}
