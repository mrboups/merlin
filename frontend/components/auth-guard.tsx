"use client";

import { useAuth } from "@/lib/auth";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = useAuth();
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (ready && !authenticated && !hasRedirected.current) {
      const timeout = setTimeout(() => {
        if (!hasRedirected.current) {
          hasRedirected.current = true;
          router.replace("/");
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [ready, authenticated, router]);

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
