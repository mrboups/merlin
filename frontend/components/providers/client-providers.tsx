"use client";

import { QueryProvider } from "./query-provider";
import { AuthProvider } from "./auth-provider";
import { VersionCheck } from "@/components/version-check";
import { AuthGate } from "@/components/auth-gate";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <QueryProvider>
        <VersionCheck />
        <AuthGate>{children}</AuthGate>
      </QueryProvider>
    </AuthProvider>
  );
}
