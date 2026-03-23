"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Wifi,
  WifiOff,
  Wallet,
} from "lucide-react";

interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export function SystemStatus() {
  const { ready, authenticated, user } = useAuth();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const health = useQuery({
    queryKey: ["api-health"],
    queryFn: async () => {
      const res = await apiClient.get<HealthResponse>("/api/v1/health");
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    refetchInterval: 30000,
    retry: 1,
    enabled: ready,
  });

  const walletAddress = user?.address || "";

  const apiOk = health.data?.status === "ok";
  const apiError = health.isError;

  // Don't show anything when everything is fine
  if (online && apiOk && authenticated && walletAddress) return null;

  return (
    <div className="space-y-1 px-6 pt-2">
      {!online && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm">
          <WifiOff className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-destructive">
            No internet connection. Check your network.
          </span>
        </div>
      )}

      {online && apiError && (
        <div className="flex items-center gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
          <span className="text-yellow-600 dark:text-yellow-400">
            API unreachable. Some features may not work.
          </span>
        </div>
      )}

      {ready && authenticated && !walletAddress && (
        <div className="flex items-center gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-sm">
          <Wallet className="h-4 w-4 text-yellow-600 shrink-0" />
          <span className="text-yellow-600 dark:text-yellow-400">
            Wallet initializing... This may take a moment.
          </span>
        </div>
      )}
    </div>
  );
}

export function StatusBar() {
  const { ready, authenticated, user } = useAuth();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const health = useQuery({
    queryKey: ["api-health"],
    refetchInterval: 30000,
    retry: 1,
    enabled: ready,
  });

  const walletAddress = user?.address || "";

  const apiOk = health.data && !health.isError;

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        {online ? (
          <Wifi className="h-3 w-3 text-green-500" />
        ) : (
          <WifiOff className="h-3 w-3 text-red-500" />
        )}
        {online ? "Online" : "Offline"}
      </span>
      <span className="flex items-center gap-1">
        {apiOk ? (
          <CheckCircle className="h-3 w-3 text-green-500" />
        ) : (
          <XCircle className="h-3 w-3 text-red-500" />
        )}
        API
      </span>
      {authenticated && (
        <span className="flex items-center gap-1">
          {walletAddress ? (
            <CheckCircle className="h-3 w-3 text-green-500" />
          ) : (
            <AlertTriangle className="h-3 w-3 text-yellow-500" />
          )}
          Wallet
        </span>
      )}
    </div>
  );
}
