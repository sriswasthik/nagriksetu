import { AppShell } from '@/components/layout/AppShell';

export default function CitizenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell navType="citizen" width="content">
      {children}
    </AppShell>
  );
}
