"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { ArrowLeft, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface SocialSignal {
  id: string;
  symbol: string;
  post_count: number;
  summary: string;
  sentiment_score: number;
  signal_count: number;
  created_at: string;
}

interface SignalsResponse {
  signals: SocialSignal[];
}

function SentimentBadge({ score }: { score: number }) {
  if (score > 0.2) {
    return (
      <Badge variant="secondary" className="text-xs gap-1">
        <TrendingUp className="h-3 w-3" />
        Bullish ({score.toFixed(2)})
      </Badge>
    );
  }
  if (score < -0.2) {
    return (
      <Badge variant="destructive" className="text-xs gap-1">
        <TrendingDown className="h-3 w-3" />
        Bearish ({score.toFixed(2)})
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs gap-1">
      <Minus className="h-3 w-3" />
      Neutral ({score.toFixed(2)})
    </Badge>
  );
}

export default function SocialPage() {
  const [symbolFilter, setSymbolFilter] = useState("");

  const signals = useQuery({
    queryKey: ["social-signals", symbolFilter],
    queryFn: async () => {
      const params = symbolFilter ? `?symbol=${encodeURIComponent(symbolFilter)}&limit=50` : "?limit=50";
      const res = await apiClient.get<SignalsResponse>(`/api/v1/social/signals${params}`);
      if (res.error) throw new Error(res.error);
      return res.data?.signals ?? [];
    },
    retry: false,
  });

  return (
    <main className="min-h-screen">
      <div className="px-6 pt-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Chat
        </Link>
      </div>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Social Signals</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Recent social sentiment analysis from X/Twitter via Grok
              </p>
            </div>
            <Input
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
              placeholder="Filter by symbol..."
              className="w-40"
            />
          </div>

          {signals.isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Loading signals...</p>
            </div>
          ) : signals.isError ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {signals.error?.message || "Unable to load social signals"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Signals are generated when trades are analyzed by the AI agent.
              </p>
            </div>
          ) : signals.data && signals.data.length > 0 ? (
            <div className="space-y-3">
              {signals.data.map((signal) => (
                <Card key={signal.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{signal.symbol}</span>
                          <SentimentBadge score={signal.sentiment_score} />
                          <span className="text-xs text-muted-foreground">
                            {signal.post_count} posts
                          </span>
                        </div>
                        {signal.summary && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {signal.summary}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(signal.created_at).toLocaleDateString()}{" "}
                        {new Date(signal.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm text-muted-foreground">
                No social signals yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Signals are collected when the AI agent analyzes trades. Try chatting with the agent first.
              </p>
            </div>
          )}
        </div>
    </main>
  );
}
