"use client";

import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, LogOut, Moon, Sun, Wallet, Shield, Copy, Check, KeyRound, Volume2, VolumeX, Repeat, Sparkles } from "lucide-react";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [copied, setCopied] = useState(false);
  const [riskLevel, setRiskLevel] = useState<"conservative" | "moderate" | "aggressive">("moderate");
  const [maxDailyNotional, setMaxDailyNotional] = useState("5000");
  const [maxPositionPct, setMaxPositionPct] = useState(25);
  const [riskSaving, setRiskSaving] = useState(false);
  const [riskSaved, setRiskSaved] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [tokenProvider, setTokenProvider] = useState<"xstocks" | "ondo">("xstocks");
  const [providerSaving, setProviderSaving] = useState(false);
  const [preferredModel, setPreferredModel] = useState<string>("claude");

  useEffect(() => {
    const stored = localStorage.getItem("fw_voice_enabled");
    if (stored !== null) setVoiceEnabled(stored === "true");
    const m = localStorage.getItem("fw_preferred_model");
    if (m) setPreferredModel(m);
  }, []);

  // Load token provider from localStorage + backend
  useEffect(() => {
    const stored = localStorage.getItem("fw_token_provider");
    if (stored === "xstocks" || stored === "ondo") setTokenProvider(stored);

    // Also fetch from backend
    apiClient.get<{ token_provider: string }>("/api/v1/chat/provider").then((res) => {
      if (res.data?.token_provider) {
        setTokenProvider(res.data.token_provider as "xstocks" | "ondo");
        localStorage.setItem("fw_token_provider", res.data.token_provider);
      }
    }).catch(() => {});
  }, []);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    localStorage.setItem("fw_voice_enabled", String(next));
  };

  const selectProvider = async (provider: "xstocks" | "ondo") => {
    setTokenProvider(provider);
    localStorage.setItem("fw_token_provider", provider);
    setProviderSaving(true);
    try {
      await apiClient.patch("/api/v1/chat/provider", { token_provider: provider });
    } catch {
      // Revert on error
      const prev = provider === "xstocks" ? "ondo" : "xstocks";
      setTokenProvider(prev);
      localStorage.setItem("fw_token_provider", prev);
    } finally {
      setProviderSaving(false);
    }
  };

  const selectModel = (model: string) => {
    setPreferredModel(model);
    localStorage.setItem("fw_preferred_model", model);
  };

  const saveRiskProfile = async () => {
    setRiskSaving(true);
    try {
      // Uses the default persona config endpoint
      await apiClient.patch("/api/v1/agents/personas/default/config", {
        risk_level: riskLevel,
        max_daily_notional: parseFloat(maxDailyNotional) || 5000,
        max_position_pct: maxPositionPct,
      });
      setRiskSaved(true);
      setTimeout(() => setRiskSaved(false), 2000);
    } catch {
      // Error handled silently
    } finally {
      setRiskSaving(false);
    }
  };

  const walletAddress = user?.address || "";

  useEffect(() => {
    const html = document.documentElement;
    if (theme === "dark") {
      html.classList.remove("light");
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
      html.classList.add("light");
    }
  }, [theme]);

  const copyAddress = async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  return (
    <main className="min-h-screen">
      <div className="px-6 pt-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Chat
        </Link>
      </div>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your account and preferences
            </p>
          </div>

          {/* Wallet */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Wallet
              </CardTitle>
              <CardDescription>
                Your wallet, secured with passkey authentication
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground mb-1">Address</p>
                  <p className="text-sm font-mono truncate">
                    {walletAddress || "Loading..."}
                  </p>
                </div>
                {walletAddress && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyAddress}
                    className="shrink-0 ml-2"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">EVM</Badge>
                <Badge variant="outline">Embedded Wallet</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Seed Phrase Backup */}
          <Card className="border-orange-500/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-orange-400" />
                Seed Phrase
              </CardTitle>
              <CardDescription>
                Seed phrase backup will be available in a future update.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                disabled
                className="w-full"
              >
                <KeyRound className="mr-2 h-4 w-4 text-orange-400" />
                Export Seed Phrase
              </Button>
            </CardContent>
          </Card>

          {/* Theme */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {theme === "dark" ? (
                  <Moon className="h-5 w-5" />
                ) : (
                  <Sun className="h-5 w-5" />
                )}
                Appearance
              </CardTitle>
              <CardDescription>
                Customize the look and feel of the app
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Theme</p>
                  <p className="text-xs text-muted-foreground">
                    {theme === "dark" ? "Dark mode" : "Light mode"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setTheme(theme === "dark" ? "light" : "dark")
                  }
                >
                  {theme === "dark" ? (
                    <>
                      <Sun className="mr-2 h-4 w-4" />
                      Light
                    </>
                  ) : (
                    <>
                      <Moon className="mr-2 h-4 w-4" />
                      Dark
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Voice */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {voiceEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                Voice Responses
              </CardTitle>
              <CardDescription>
                AI chat responses are read aloud using Cartesia voice synthesis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Text-to-Speech</p>
                  <p className="text-xs text-muted-foreground">
                    {voiceEnabled ? "Voice is enabled — responses are read aloud" : "Voice is disabled"}
                  </p>
                </div>
                <Button
                  variant={voiceEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={toggleVoice}
                >
                  {voiceEnabled ? (
                    <>
                      <Volume2 className="mr-2 h-4 w-4" />
                      On
                    </>
                  ) : (
                    <>
                      <VolumeX className="mr-2 h-4 w-4" />
                      Off
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preferred Model */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Model
              </CardTitle>
              <CardDescription>
                Choose which AI model powers your trading analysis and chat
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { value: "claude", label: "Claude", desc: "Anthropic's Claude Haiku 4.5 — fast, precise analysis" },
                { value: "grok", label: "Grok", desc: "xAI's Grok-3 — native X/Twitter access for social sentiment" },
                { value: "openai", label: "GPT", desc: "OpenAI's GPT-4o-mini — general-purpose trading analysis" },
              ].map((m) => (
                <button key={m.value} onClick={() => selectModel(m.value)}
                  className={`w-full flex items-center justify-between rounded-md border p-3 transition-colors ${
                    preferredModel === m.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
                  }`}>
                  <div className="text-left">
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                  {preferredModel === m.value && <Badge variant="default" className="shrink-0 ml-2">Active</Badge>}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Token Provider */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Repeat className="h-5 w-5" />
                Token Provider
              </CardTitle>
              <CardDescription>
                Choose which tokenized stock provider to use for trading equities (TSLA, AAPL, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                onClick={() => selectProvider("xstocks")}
                disabled={providerSaving}
                className={`w-full flex items-center justify-between rounded-md border p-3 transition-colors ${
                  tokenProvider === "xstocks"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                }`}
              >
                <div className="text-left">
                  <p className="text-sm font-medium">xStocks</p>
                  <p className="text-xs text-muted-foreground">
                    Tokenized stocks by xStocks.fi on Ethereum (TSLAx, AAPLx, etc.)
                  </p>
                </div>
                {tokenProvider === "xstocks" && (
                  <Badge variant="default" className="shrink-0 ml-2">Active</Badge>
                )}
              </button>
              <button
                onClick={() => selectProvider("ondo")}
                disabled={providerSaving}
                className={`w-full flex items-center justify-between rounded-md border p-3 transition-colors ${
                  tokenProvider === "ondo"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                }`}
              >
                <div className="text-left">
                  <p className="text-sm font-medium">Ondo Finance</p>
                  <p className="text-xs text-muted-foreground">
                    Tokenized stocks by Ondo Finance on Ethereum (TSLAon, AAPLon, etc.)
                  </p>
                </div>
                {tokenProvider === "ondo" && (
                  <Badge variant="default" className="shrink-0 ml-2">Active</Badge>
                )}
              </button>
            </CardContent>
          </Card>

          {/* Risk Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Risk Profile
              </CardTitle>
              <CardDescription>
                Configure your risk tolerance and trading limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Risk Level</label>
                <select
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value as typeof riskLevel)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="conservative">Conservative</option>
                  <option value="moderate">Moderate</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Max Daily Notional (USD)</label>
                <input
                  type="number"
                  value={maxDailyNotional}
                  onChange={(e) => setMaxDailyNotional(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  min="0"
                  step="100"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Max Position Size: {maxPositionPct}%
                </label>
                <input
                  type="range"
                  value={maxPositionPct}
                  onChange={(e) => setMaxPositionPct(parseInt(e.target.value))}
                  className="w-full"
                  min="5"
                  max="100"
                  step="5"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>5%</span>
                  <span>100%</span>
                </div>
              </div>
              <Button
                size="sm"
                onClick={saveRiskProfile}
                disabled={riskSaving}
              >
                {riskSaving ? "Saving..." : riskSaved ? "Saved!" : "Save Risk Profile"}
              </Button>
            </CardContent>
          </Card>

          {/* Logout */}
          <Card className="border-destructive/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Sign Out</p>
                  <p className="text-xs text-muted-foreground">
                    Sign out of your Merlin account
                  </p>
                </div>
                <Button variant="destructive" size="sm" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
    </main>
  );
}
