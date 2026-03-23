"use client";

import { useAuth } from "@/lib/auth";
import { useEffect, useRef, useState } from "react";
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
import { ArrowLeft, LogOut, Moon, Sun, Wallet, Shield, Copy, Check, KeyRound, Volume2, VolumeX, Repeat, Sparkles, AlertTriangle, X, Download, Upload } from "lucide-react";

export default function SettingsPage() {
  const { user, logout, importSeed, exportSeed } = useAuth();
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

  // --- Export seed modal state ---
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportedMnemonic, setExportedMnemonic] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);

  // --- Import seed modal state ---
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMnemonic, setImportMnemonic] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  // Ref used to auto-focus the import textarea when the modal opens.
  const importTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("merlin_voice_enabled");
    if (stored !== null) setVoiceEnabled(stored === "true");
    const m = localStorage.getItem("merlin_preferred_model");
    if (m) setPreferredModel(m);
  }, []);

  // Load token provider from localStorage + backend
  useEffect(() => {
    const stored = localStorage.getItem("merlin_token_provider");
    if (stored === "xstocks" || stored === "ondo") setTokenProvider(stored);

    // Also fetch from backend
    apiClient.get<{ token_provider: string }>("/api/v1/chat/provider").then((res) => {
      if (res.data?.token_provider) {
        setTokenProvider(res.data.token_provider as "xstocks" | "ondo");
        localStorage.setItem("merlin_token_provider", res.data.token_provider);
      }
    }).catch(() => {});
  }, []);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    localStorage.setItem("merlin_voice_enabled", String(next));
  };

  const selectProvider = async (provider: "xstocks" | "ondo") => {
    setTokenProvider(provider);
    localStorage.setItem("merlin_token_provider", provider);
    setProviderSaving(true);
    try {
      await apiClient.patch("/api/v1/chat/provider", { token_provider: provider });
    } catch {
      // Revert on error
      const prev = provider === "xstocks" ? "ondo" : "xstocks";
      setTokenProvider(prev);
      localStorage.setItem("merlin_token_provider", prev);
    } finally {
      setProviderSaving(false);
    }
  };

  const selectModel = (model: string) => {
    setPreferredModel(model);
    localStorage.setItem("merlin_preferred_model", model);
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

  // ---------------------------------------------------------------------------
  // Export seed handlers
  // ---------------------------------------------------------------------------

  const openExportModal = async () => {
    setExportedMnemonic(null);
    setExportError(null);
    setExportCopied(false);
    setExportLoading(true);
    setShowExportModal(true);
    try {
      const mnemonic = await exportSeed();
      setExportedMnemonic(mnemonic);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Failed to export seed phrase");
    } finally {
      setExportLoading(false);
    }
  };

  const closeExportModal = () => {
    // Clear the plaintext mnemonic from state as soon as the modal closes.
    setExportedMnemonic(null);
    setExportError(null);
    setExportCopied(false);
    setShowExportModal(false);
  };

  const copyMnemonic = async () => {
    if (!exportedMnemonic) return;
    await navigator.clipboard.writeText(exportedMnemonic);
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

  // ---------------------------------------------------------------------------
  // Import seed handlers
  // ---------------------------------------------------------------------------

  const openImportModal = () => {
    setImportMnemonic("");
    setImportError(null);
    setImportSuccess(false);
    setShowImportModal(true);
    // Focus the textarea after the modal renders.
    setTimeout(() => importTextareaRef.current?.focus(), 50);
  };

  const closeImportModal = () => {
    // Clear state — the textarea may contain the user's mnemonic.
    setImportMnemonic("");
    setImportError(null);
    setImportSuccess(false);
    setShowImportModal(false);
  };

  const handleImport = async () => {
    setImportError(null);
    setImportLoading(true);
    try {
      await importSeed(importMnemonic);
      setImportSuccess(true);
      // Clear the textarea now that the import is done.
      setImportMnemonic("");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed — please try again");
    } finally {
      setImportLoading(false);
    }
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
                <Download className="h-5 w-5 text-orange-400" />
                Seed Phrase Backup
              </CardTitle>
              <CardDescription>
                View and copy your 24-word recovery phrase. Store it somewhere safe — it is the only way to recover your wallet if you lose access to your passkey.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-2 rounded-md bg-orange-500/10 border border-orange-500/30 p-3 text-sm text-orange-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>Anyone who has your seed phrase can access your funds. Never share it with anyone.</p>
              </div>
              <Button
                variant="outline"
                className="w-full border-orange-500/40 hover:border-orange-500/70"
                onClick={openExportModal}
              >
                <KeyRound className="mr-2 h-4 w-4 text-orange-400" />
                Show Seed Phrase
              </Button>
            </CardContent>
          </Card>

          {/* Import Seed Phrase */}
          <Card className="border-yellow-500/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="h-5 w-5 text-yellow-400" />
                Import Seed Phrase
              </CardTitle>
              <CardDescription>
                Replace your current wallet with a different 12- or 24-word BIP-39 seed phrase. Your new address will be derived from the imported phrase.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm text-yellow-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>This will permanently replace your current seed phrase and wallet address. Make sure you have backed up your existing phrase first.</p>
              </div>
              <Button
                variant="outline"
                className="w-full border-yellow-500/40 hover:border-yellow-500/70"
                onClick={openImportModal}
              >
                <Upload className="mr-2 h-4 w-4 text-yellow-400" />
                Import Seed Phrase
              </Button>
            </CardContent>
          </Card>

          {/* Export Seed Phrase Modal */}
          {showExportModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="relative w-full max-w-lg rounded-xl border bg-background shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b px-6 py-4">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-orange-400" />
                    <h2 className="text-base font-semibold">Your Seed Phrase</h2>
                  </div>
                  <button
                    onClick={closeExportModal}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                  {exportLoading && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Decrypting seed phrase…
                    </p>
                  )}

                  {exportError && (
                    <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <p>{exportError}</p>
                    </div>
                  )}

                  {exportedMnemonic && (
                    <>
                      <div className="flex items-start gap-2 rounded-md bg-orange-500/10 border border-orange-500/30 p-3 text-sm text-orange-300">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>Write these words down and store them safely. Anyone with this phrase can access your wallet.</p>
                      </div>

                      {/* Word grid — 4 columns */}
                      <div className="grid grid-cols-4 gap-2">
                        {exportedMnemonic.split(" ").map((word, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1.5"
                          >
                            <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">
                              {i + 1}.
                            </span>
                            <span className="text-sm font-mono font-medium truncate">{word}</span>
                          </div>
                        ))}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={copyMnemonic}
                      >
                        {exportCopied ? (
                          <>
                            <Check className="mr-2 h-4 w-4 text-green-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy to Clipboard
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="flex justify-end border-t px-6 py-4">
                  <Button variant="outline" onClick={closeExportModal}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Import Seed Phrase Modal */}
          {showImportModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="relative w-full max-w-lg rounded-xl border bg-background shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-yellow-400" />
                    <h2 className="text-base font-semibold">Import Seed Phrase</h2>
                  </div>
                  <button
                    onClick={closeImportModal}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Close"
                    disabled={importLoading}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                  {importSuccess ? (
                    <div className="space-y-4">
                      <div className="flex items-start gap-2 rounded-md bg-green-500/10 border border-green-500/30 p-3 text-sm text-green-300">
                        <Check className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>Seed phrase imported successfully. Your wallet address has been updated.</p>
                      </div>
                      <Button className="w-full" onClick={closeImportModal}>
                        Done
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm text-yellow-300">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>This will replace your current seed phrase. Ensure your existing phrase is backed up before proceeding.</p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="import-mnemonic">
                          Enter your 12- or 24-word seed phrase
                        </label>
                        <textarea
                          id="import-mnemonic"
                          ref={importTextareaRef}
                          value={importMnemonic}
                          onChange={(e) => {
                            setImportMnemonic(e.target.value);
                            setImportError(null);
                          }}
                          placeholder="word1 word2 word3 …"
                          rows={4}
                          disabled={importLoading}
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none"
                          spellCheck={false}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                        />
                        <p className="text-xs text-muted-foreground">
                          Separate words with spaces. The phrase is validated before import.
                        </p>
                      </div>

                      {importError && (
                        <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                          <p>{importError}</p>
                        </div>
                      )}

                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={closeImportModal}
                          disabled={importLoading}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="flex-1"
                          onClick={handleImport}
                          disabled={importLoading || importMnemonic.trim().length === 0}
                        >
                          {importLoading ? "Importing…" : "Import Phrase"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

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
