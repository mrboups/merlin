"use client";

import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import {
  ArrowLeft,
  ArrowUpRight,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface TradeData {
  id: string;
  asset: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  total: number;
  status: string;
  created_at: string;
  tx_hash: string;
}

interface TradesResponse {
  trades: TradeData[];
  page: number;
  page_size: number;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "default",
  executed: "default",
  pending: "secondary",
  quoted: "secondary",
  simulated: "secondary",
  approved: "secondary",
  rejected: "destructive",
  failed: "destructive",
};

export default function TradesPage() {
  const { ready, authenticated } = useAuth();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const trades = useQuery({
    queryKey: ["trades", page],
    queryFn: async () => {
      const res = await apiClient.get<TradesResponse>(
        `/api/v1/trades?page=${page}&page_size=${pageSize}`
      );
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    retry: false,
    enabled: ready && authenticated,
  });

  const tradeList = trades.data?.trades ?? [];

  return (
    <main className="min-h-screen">
      <div className="px-6 pt-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Chat
        </Link>
      </div>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Trade History</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View all your past trades and their status
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5" />
                All Trades
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trades.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : trades.isError ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Unable to load trades
                  </p>
                </div>
              ) : tradeList.length ? (
                <div className="space-y-3">
                  {tradeList.map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{trade.asset}</p>
                          <Badge
                            variant={
                              STATUS_VARIANTS[trade.status] ?? "secondary"
                            }
                            className="text-xs"
                          >
                            {trade.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {trade.side.toUpperCase()} - {trade.quantity} @{" "}
                          ${trade.price.toLocaleString()}
                        </p>
                        {trade.created_at && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(trade.created_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          ${trade.total.toLocaleString()}
                        </p>
                        {trade.tx_hash && (
                          <p className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                            {trade.tx_hash.slice(0, 10)}...
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ArrowUpRight className="h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No trades yet
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use Chat to execute your first trade.
                  </p>
                </div>
              )}

              {tradeList.length > 0 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={tradeList.length < pageSize}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
    </main>
  );
}
