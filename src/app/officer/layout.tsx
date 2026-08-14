import { AppShell } from '@/components/layout/AppShell';

export default function OfficerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell navType="officer" width="wide">
      {children}
    </AppShell>
  );
}
