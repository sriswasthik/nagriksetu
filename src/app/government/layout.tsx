import { AppShell } from '@/components/layout/AppShell';
import { requireWorkspace } from '@/lib/auth/guard';

export default async function GovernmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireWorkspace(['supervisor', 'government_admin']);

  return (
    <AppShell navType="government" width="wide">
      {children}
    </AppShell>
  );
}
