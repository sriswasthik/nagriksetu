import { AppShell } from '@/components/layout/AppShell';

export default function GovernmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell navType="government" width="wide">
      {children}
    </AppShell>
  );
}
