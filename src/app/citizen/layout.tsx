import { AppShell } from '@/components/layout/AppShell';
import { requireWorkspace } from '@/lib/auth/guard';

export default async function CitizenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireWorkspace(['citizen']);

  return (
    <AppShell navType="citizen" width="content">
      {children}
    </AppShell>
  );
}
