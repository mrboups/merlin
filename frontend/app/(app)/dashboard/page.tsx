"use client";

import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { NavSidebar } from "@/components/nav-sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { SystemStatus } from "@/components/system-status";
import {
  Wallet,
  MessageSquare,
  BarChart3,
  Users,
  ArrowUpRight,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface PortfolioData {
  total_value: number;
  positions: Array<{
    asset: string;
    symbol: string;
    quantity: number;
    value: number;
    pnl_percent: number;
  }>;
}

interface TradeData {
  id: string;
  asset: string;
  side: string;
  quantity: number;
  price: number;
  status: string;
  created_at: string;
}

interface TradesResponse {
  trades: TradeData[];
}

export default function DashboardPage() {
  const { ready, authenticated, user } = useAuth();

  const walletAddress = user?.address || "";

  const portfolio = useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => {
      const res = await apiClient.get<PortfolioData>("/api/v1/portfolio");
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    retry: false,
    enabled: ready && authenticated,
  });

  const trades = useQuery({
    queryKey: ["trades"],
    queryFn: async () => {
      const res = await apiClient.get<TradesResponse>("/api/v1/trades");
      if (res.error) throw new Error(res.error);
      return res.data?.trades ?? [];
    },
    retry: false,
    enabled: ready && authenticated,
  });

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <NavSidebar />
      <main className="md:ml-64 pt-14 md:pt-0 pb-16 md:pb-0 min-h-screen">
        <SystemStatus />
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {walletAddress
                ? `Wallet: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                : "Connecting wallet..."}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { href: "/chat", icon: MessageSquare, label: "Chat" },
              { href: "/assets", icon: BarChart3, label: "Assets" },
              { href: "/personas", icon: Users, label: "Personas" },
              { href: "/settings", icon: Wallet, label: "Settings" },
            ].map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{label}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" /> Portfolio
              </CardTitle>
            </CardHeader>
            <CardContent>
              {portfolio.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : portfolio.isError ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Unable to load portfolio</p>
                  <p className="text-xs text-muted-foreground mt-1">Your positions will appear here once connected.</p>
                </div>
              ) : portfolio.data?.positions?.length ? (
                <div className="space-y-3">
                  {portfolio.data.positions.map((pos) => (
                    <div key={pos.symbol} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium text-sm">{pos.asset}</p>
                        <p className="text-xs text-muted-foreground">{pos.symbol} - {pos.quantity} units</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">${(pos.value ?? 0).toLocaleString()}</p>
                        <Badge variant={(pos.pnl_percent ?? 0) >= 0 ? "secondary" : "destructive"} className="text-xs">
                          {(pos.pnl_percent ?? 0) >= 0 ? "+" : ""}{(pos.pnl_percent ?? 0).toFixed(2)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Wallet className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No positions yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Start trading via Chat to build your portfolio.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5" /> Recent Trades
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trades.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : trades.isError ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Unable to load trades</p>
                  <p className="text-xs text-muted-foreground mt-1">Your trade history will appear here.</p>
                </div>
              ) : trades.data?.length ? (
                <div className="space-y-3">
                  {trades.data.map((trade) => (
                    <div key={trade.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium text-sm">{trade.asset}</p>
                        <p className="text-xs text-muted-foreground">
                          {(trade.side ?? "buy").toUpperCase()} - {trade.quantity ?? 0} @ ${(trade.price ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="secondary">{trade.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <ArrowUpRight className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No trades yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Use Chat to execute your first trade.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
