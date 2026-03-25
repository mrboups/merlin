"use client";

import { useQuery } from "@tanstack/react-query";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Search,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

interface Asset {
  symbol: string;
  name: string;
  asset_type: string;
  price?: number;
  change_24h?: number;
}

interface AssetsResponse {
  assets: Asset[];
}

export default function AssetsPage() {
  const [search, setSearch] = useState("");

  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const res = await apiClient.get<AssetsResponse>("/api/v1/market/assets");
      if (res.error) throw new Error(res.error);
      return res.data?.assets ?? [];
    },
    retry: false,
  });

  const filteredAssets = assets.data?.filter(
    (a) =>
      a.symbol.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen">
      <div className="px-6 pt-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Chat
        </Link>
      </div>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Assets</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse available xStocks and crypto assets
            </p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Asset list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Market
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assets.isLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Connecting to market data...
                  </p>
                </div>
              ) : assets.isError ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {assets.error?.message === "API not configured"
                      ? "Market data service not connected"
                      : "Unable to load market data"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Asset prices will appear here once the backend is available.
                  </p>
                </div>
              ) : filteredAssets?.length ? (
                <div className="space-y-2">
                  {filteredAssets.map((asset) => (
                    <div
                      key={asset.symbol}
                      className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                          {asset.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{asset.name}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground">
                              {asset.symbol}
                            </p>
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              {asset.asset_type ?? "asset"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {asset.price !== undefined ? (
                          <>
                            <p className="text-sm font-medium">
                              ${asset.price.toLocaleString()}
                            </p>
                            {asset.change_24h !== undefined && (
                              <div className="flex items-center justify-end gap-1">
                                {asset.change_24h >= 0 ? (
                                  <TrendingUp className="h-3 w-3 text-green-400" />
                                ) : (
                                  <TrendingDown className="h-3 w-3 text-red-400" />
                                )}
                                <span
                                  className={`text-xs ${
                                    asset.change_24h >= 0
                                      ? "text-green-400"
                                      : "text-red-400"
                                  }`}
                                >
                                  {asset.change_24h >= 0 ? "+" : ""}
                                  {asset.change_24h.toFixed(2)}%
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">--</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BarChart3 className="h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {search ? "No assets match your search" : "No assets available"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
    </main>
  );
}
