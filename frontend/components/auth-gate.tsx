"use client";

import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Loader2, KeyRound, UserPlus } from "lucide-react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, signup } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true); setError(null);
    try {
      await login();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed. Try again.");
    }
    setLoading(false);
  };

  const handleSignup = async () => {
    setLoading(true); setError(null);
    try {
      await signup();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Signup failed. Try again.");
    }
    setLoading(false);
  };

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Merlin</CardTitle>
            <CardDescription>
              Privacy-preserving wallet for stocks and crypto.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button size="lg" className="w-full text-base" onClick={handleLogin} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <KeyRound className="mr-2 h-5 w-5" />}
              Log in with Passkey
            </Button>
            <Button size="lg" variant="outline" className="w-full text-base" onClick={handleSignup} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UserPlus className="mr-2 h-5 w-5" />}
              Create Account
            </Button>
            {error && <p className="text-center text-xs text-destructive">{error}</p>}
            <p className="text-center text-xs text-muted-foreground">
              A wallet is created automatically on signup.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
