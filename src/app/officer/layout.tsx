import { AppShell } from '@/components/layout/AppShell';
import { requireWorkspace } from '@/lib/auth/guard';

export default async function OfficerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Supervisors and administrators oversee field work from here too.
  await requireWorkspace(['officer', 'supervisor', 'government_admin']);

  return (
    <AppShell navType="officer" width="wide">
      {children}
    </AppShell>
  );
}
