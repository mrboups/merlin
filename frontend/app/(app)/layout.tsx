import { ClientProviders } from "@/components/providers/client-providers";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ClientProviders>{children}</ClientProviders>;
}
