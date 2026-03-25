"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import {
  MessageSquare,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Wallet,
  ArrowUpRight,
  Radio,
  TrendingUp,
  TrendingDown,
  ArrowUpFromLine,
  ArrowDownToLine,
  KeyRound,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";

const navItems = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/assets", label: "Assets", icon: BarChart3 },
  { href: "/trades", label: "Trades", icon: ArrowUpRight },
  { href: "/personas", label: "Personas", icon: Users },
  { href: "/social", label: "Social", icon: Radio },
  { href: "/settings", label: "Settings", icon: Settings },
];

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface PnlData {
  total_market_value: number;
  total_cost_basis: number;
  total_unrealized_pnl: number;
  total_unrealized_pnl_pct: number;
  position_count: number;
}

interface PortfolioHistoryEntry {
  date: string;
  total_value: number;
  total_pnl: number;
  position_count: number;
}

export function NavSidebar() {
  const pathname = usePathname();
  const { user, logout, ready, authenticated } = useAuth();

  const walletAddress = user?.address || "";

  // Fetch portfolio PnL
  const pnl = useQuery({
    queryKey: ["portfolio-pnl-nav"],
    queryFn: async () => {
      const res = await apiClient.get<PnlData>("/api/v1/portfolio/pnl");
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    retry: false,
    enabled: ready && authenticated,
    refetchInterval: 30000, // refresh every 30s
  });

  // Fetch portfolio history for 24h change
  const history = useQuery({
    queryKey: ["portfolio-history-nav"],
    queryFn: async () => {
      const res = await apiClient.get<{ history: PortfolioHistoryEntry[] }>(
        "/api/v1/portfolio/history?days=2"
      );
      if (res.error) throw new Error(res.error);
      return res.data?.history ?? [];
    },
    retry: false,
    enabled: ready && authenticated,
    refetchInterval: 60000,
  });

  const totalValue = pnl.data?.total_market_value ?? 0;
  const totalPnl = pnl.data?.total_unrealized_pnl ?? 0;
  const totalPnlPct = pnl.data?.total_unrealized_pnl_pct ?? 0;

  // Calculate 24h change from history
  let daily24hChange = 0;
  let daily24hPct = 0;
  if (history.data && history.data.length >= 2) {
    const today = history.data[history.data.length - 1];
    const yesterday = history.data[history.data.length - 2];
    daily24hChange = today.total_value - yesterday.total_value;
    daily24hPct =
      yesterday.total_value > 0
        ? (daily24hChange / yesterday.total_value) * 100
        : 0;
  }

  const [showReceive, setShowReceive] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  const handleCopyAddress = useCallback(async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [walletAddress]);

  const handleSend = useCallback(() => {
    // Navigate to chat with a send prompt
    window.location.href = "/chat";
  }, []);

  const handleExportKey = useCallback(() => {
    // Navigate to settings for seed phrase backup
    window.location.href = "/settings";
  }, []);

  const balanceWidget = (compact: boolean) => (
    <div className={cn("flex items-center", compact ? "gap-2" : "gap-4")}>
      <div className="text-right">
        {/* Total balance */}
        <p className={cn("font-bold tabular-nums", compact ? "text-sm" : "text-base")}>
          {formatUsd(totalValue)}
        </p>
        {/* 24h change + PnL — always visible */}
        <div className={cn("flex items-center justify-end gap-2", compact ? "text-[10px]" : "text-xs")}>
          {/* Daily P&L $ */}
          <span
            className={cn(
              "flex items-center gap-0.5 tabular-nums",
              daily24hChange >= 0 ? "text-green-500" : "text-red-500"
            )}
          >
            {daily24hChange >= 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {daily24hChange >= 0 ? "+" : ""}
            {formatUsd(Math.abs(daily24hChange))}
          </span>
          {/* Daily P&L % */}
          <span
            className={cn(
              "tabular-nums",
              daily24hPct >= 0 ? "text-green-500" : "text-red-500"
            )}
          >
            ({daily24hPct >= 0 ? "+" : ""}
            {daily24hPct.toFixed(2)}%)
          </span>
          {/* Total PnL % */}
          {!compact && (
            <span
              className={cn(
                "tabular-nums border-l border-border pl-2 ml-1",
                totalPnl >= 0 ? "text-green-500" : "text-red-500"
              )}
            >
              PnL {totalPnl >= 0 ? "+" : ""}
              {formatUsd(Math.abs(totalPnl))} ({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%)
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const actionButtons = (compact: boolean) => (
    <div className={cn("flex items-center", compact ? "gap-1 mr-2" : "gap-3")}>
      <button
        onClick={handleSend}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg transition-colors hover:bg-accent",
          compact ? "h-8 w-8" : "h-10 w-12 gap-0.5"
        )}
        title="Send — open chat to send tokens"
      >
        <ArrowUpFromLine className={cn("text-primary", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        {!compact && <span className="text-[10px] text-muted-foreground">Send</span>}
      </button>
      <button
        onClick={() => setShowReceive(true)}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg transition-colors hover:bg-accent",
          compact ? "h-8 w-8" : "h-10 w-12 gap-0.5"
        )}
        title="Receive — show your wallet address"
      >
        <ArrowDownToLine className={cn("text-green-500", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        {!compact && <span className="text-[10px] text-muted-foreground">Receive</span>}
      </button>
      <button
        onClick={handleExportKey}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg transition-colors hover:bg-accent",
          compact ? "h-8 w-8" : "h-10 w-12 gap-0.5"
        )}
        title="Export Key — manage in Settings"
      >
        <KeyRound className={cn("text-orange-400", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        {!compact && <span className="text-[10px] text-muted-foreground">Key</span>}
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile top bar — logo + actions + balance (no burger) */}
      <div className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          <span className="font-bold">Merlin</span>
        </Link>
        <div className="flex items-center gap-1">
          {actionButtons(true)}
          {balanceWidget(true)}
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden md:flex h-full w-64 flex-col border-r bg-background">
        {/* Logo + balance + actions */}
        <div className="border-b px-6 py-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <span className="font-bold text-lg">Merlin</span>
          </div>
          <div className="mt-2">
            {balanceWidget(false)}
          </div>
          <div className="mt-2 flex justify-center">
            {actionButtons(false)}
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#627eea]/15">
              <svg className="h-5 w-5" viewBox="0 0 256 417" preserveAspectRatio="xMidYMid">
                <path fill="#627eea" d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z"/>
                <path fill="#8c9eff" d="M127.962 0L0 212.32l127.962 75.639V154.158z"/>
                <path fill="#627eea" d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.601L256 236.587z"/>
                <path fill="#8c9eff" d="M127.962 416.905v-104.72L0 236.585z"/>
                <path fill="#3c3c8e" d="M127.961 287.958l127.96-75.637-127.96-58.162z"/>
                <path fill="#627eea" d="M0 212.32l127.96 75.638v-133.8z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">
                {walletAddress ? truncateAddress(walletAddress) : "No wallet"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start text-muted-foreground hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background md:hidden">
        {navItems.slice(0, 5).map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Receive modal */}
      {showReceive && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/60"
            onClick={() => setShowReceive(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-[61] w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-1">Receive</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Send tokens to this address on Ethereum.
            </p>
            <div className="rounded-lg border bg-muted/50 p-3 flex items-center gap-2">
              <code className="text-xs break-all flex-1 text-foreground">
                {walletAddress || "No wallet connected"}
              </code>
              {walletAddress && (
                <button
                  onClick={handleCopyAddress}
                  className="shrink-0 rounded-md p-1.5 hover:bg-accent transition-colors"
                  title="Copy address"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              )}
            </div>
            {copied && (
              <p className="text-xs text-green-500 mt-2">Address copied!</p>
            )}
            <button
              onClick={() => setShowReceive(false)}
              className="mt-4 w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        </>
      )}
    </>
  );
}
