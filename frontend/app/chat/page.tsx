"use client";

import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { API_URL } from "@/lib/constants";
import {
  Send,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Bot,
  User,
  Plus,
  Eraser,
  History,
  MessageSquare,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Menu,
  X,
  ArrowUpRight,
  ArrowUpFromLine,
  ArrowDownToLine,
  TrendingUp,
  TrendingDown,
  Copy,
  Check,
  Users,
  Settings,
  Wallet,
  Bell,
  Sparkles,
} from "lucide-react";

/* ─── types ─── */
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  requires_confirmation?: boolean;
  trade_details?: { asset: string; side: string; quantity: number; estimated_price: number; estimated_total: number };
  confirmation_id?: string;
  confirmed?: boolean;
  created_at?: string;
  metadata?: Record<string, any>;
  isNew?: boolean;
}
interface Conversation { id: string; title: string; created_at: string; updated_at: string; message_count: number }
interface ChatApiResponse {
  reply: string;
  trade_intent?: { side: string; symbol: string; intent_type: string; amount: number; estimated_price?: number; estimated_total?: number; dollar_amount?: number; is_dollar_amount?: boolean } | null;
  confirmation_token?: string | null;
  requires_confirmation?: boolean;
  conversation_id?: string | null;
}
interface PersonaOption { id: string; display_name?: string; name?: string; type?: string }

/* ─── constants ─── */
const PERSONA_CHIPS = [
  { id: "elon", img: "/personas/elon.png", label: "Elon Strategy" },
  { id: "buffett", img: "/personas/buffett.png", label: "Buffett Strategy" },
  { id: "ai_momentum", img: "/personas/ai_momentum.png", label: "AI Momentum" },
];
const ACTION_CHIPS = [
  { emoji: "\u{1F4B0}", label: "Buy crypto", prefill: "buy " },
  { emoji: "\u{1F4C8}", label: "Market analysis", prefill: "How is the crypto market doing today?" },
  { emoji: "\u{1F4B8}", label: "Send tokens", prefill: "send " },
  { emoji: "\u{1F4BC}", label: "My portfolio", prefill: "How is my portfolio doing?" },
];

/* ─── typewriter ─── */
function TypewriterText({ text, speed = 15 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed(""); setDone(false); let i = 0;
    const interval = setInterval(() => { i++; setDisplayed(text.slice(0, i)); if (i >= text.length) { clearInterval(interval); setDone(true); } }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  return <>{displayed}{!done && <span className="animate-pulse opacity-60">|</span>}</>;
}

function BuildVersion() {
  const [v, setV] = useState("");
  useEffect(() => { fetch("/version.json").then(r => r.json()).then(d => setV(d.v)).catch(() => {}); }, []);
  return v ? <p className="text-[9px] text-muted-foreground/40 leading-none">v{v}</p> : null;
}

function cleanContent(t: string) {
  return t.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#+\s/gm, "").replace(/^- /gm, "\u2022 ");
}

const MODEL_OPTIONS = [
  { id: "claude", label: "Claude", color: "#D97757", icon: "C" },
  { id: "grok", label: "Grok", color: "#FFFFFF", icon: "G" },
  { id: "openai", label: "GPT", color: "#10A37F", icon: "G" },
];

const LANG_OPTIONS = [
  { id: "en-US", label: "EN" },
  { id: "fr-FR", label: "FR" },
  { id: "es-ES", label: "ES" },
  { id: "de-DE", label: "DE" },
  { id: "it-IT", label: "IT" },
  { id: "pt-BR", label: "PT" },
  { id: "ar-SA", label: "AR" },
  { id: "zh-CN", label: "CN" },
  { id: "ja-JP", label: "JP" },
];

function DropdownPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

function PersonaDropdown({ value, onChange, personas }: {
  value: string | null; onChange: (id: string | null) => void; personas: PersonaOption[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const allOptions = [
    { id: "", img: "", label: "Default" },
    ...PERSONA_CHIPS,
    ...personas.filter(p => !PERSONA_CHIPS.some(c => c.id === p.id)).map(p => ({ id: p.id, img: "", label: p.display_name || p.name || p.id })),
  ];
  const selected = allOptions.find(o => o.id === (value ?? "")) || allOptions[0];

  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const goUp = r.top > 250;
      setStyle({
        left: Math.max(8, r.left),
        ...(goUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref}>
      <button onClick={toggle} className="flex items-center gap-2 h-8 rounded-xl bg-card border border-border/60 px-2.5 text-xs text-foreground hover:border-border transition-colors cursor-pointer">
        {selected.img ? <img src={selected.img} alt="" className="h-5 w-5 rounded-full object-cover" /> : <Bot className="h-4 w-4 text-muted-foreground" />}
        <span className="max-w-[100px] truncate">{selected.label}</span>
        <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <DropdownPortal>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="fixed z-[91] min-w-[190px] max-h-[320px] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl py-1" style={style}>
            {allOptions.map(o => (
              <button key={o.id || "_def"} onClick={() => { onChange(o.id || null); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${(value ?? "") === o.id ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"}`}>
                {o.img ? <img src={o.img} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" /> : <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0"><Bot className="h-3.5 w-3.5 text-muted-foreground" /></div>}
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        </DropdownPortal>
      )}
    </div>
  );
}

function LangDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const selected = LANG_OPTIONS.find(l => l.id === value) || LANG_OPTIONS[0];

  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const goUp = r.top > 300;
      setStyle({
        left: Math.max(8, Math.min(r.left, window.innerWidth - 150)),
        ...(goUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref}>
      <button onClick={toggle} className="flex items-center gap-1.5 h-8 rounded-xl bg-card border border-border/60 px-2.5 text-xs text-foreground hover:border-border transition-colors cursor-pointer">
        <span>{selected.label}</span>
        <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <DropdownPortal>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="fixed z-[91] min-w-[130px] max-h-[320px] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl py-1" style={style}>
            {LANG_OPTIONS.map(l => (
              <button key={l.id} onClick={() => { onChange(l.id); localStorage.setItem("fw_voice_lang", l.id); setOpen(false); }}
                className={`w-full flex items-center justify-center px-3 py-2 text-sm transition-colors ${value === l.id ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"}`}>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </DropdownPortal>
      )}
    </div>
  );
}

function ModelIcon({ id, size = 16 }: { id: string; size?: number }) {
  if (id === "claude") return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#D97757" xmlns="http://www.w3.org/2000/svg"><path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"/></svg>
  );
  if (id === "grok") return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>
  );
  // openai
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#10A37F" xmlns="http://www.w3.org/2000/svg"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>
  );
}

function ModelDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const selected = MODEL_OPTIONS.find(m => m.id === value) || MODEL_OPTIONS[0];

  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const goUp = r.top > 200;
      setStyle({
        left: Math.max(8, Math.min(r.left, window.innerWidth - 180)),
        ...(goUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref}>
      <button onClick={toggle} className="flex items-center gap-2 h-8 rounded-xl bg-card border border-border/60 px-2.5 text-xs text-foreground hover:border-border transition-colors cursor-pointer">
        <ModelIcon id={selected.id} size={16} /><span>{selected.label}</span>
        <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <DropdownPortal>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="fixed z-[91] min-w-[160px] rounded-xl border border-border bg-card shadow-2xl py-1" style={style}>
            {MODEL_OPTIONS.map(m => (
              <button key={m.id} onClick={() => { onChange(m.id); localStorage.setItem("fw_preferred_model", m.id); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${value === m.id ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"}`}>
                <ModelIcon id={m.id} size={18} /><span>{m.label}</span>
              </button>
            ))}
          </div>
        </DropdownPortal>
      )}
    </div>
  );
}

/* ─── main ─── */
export default function ChatPage() {
  const { ready, authenticated, getAccessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("claude");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceLang, setVoiceLang] = useState("en-US");
  const [voiceMode, setVoiceMode] = useState(false); // persistent voice conversation mode
  const voiceModeRef = useRef(false); // ref to avoid stale closures
  const [listening, setListening] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserMsgRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const hasMessages = messages.length > 0;

  /* ─── effects ─── */
  useEffect(() => {
    const s = localStorage.getItem("fw_voice_enabled"); if (s !== null) setVoiceEnabled(s === "true");
    const l = localStorage.getItem("fw_voice_lang"); if (l) setVoiceLang(l);
    const m = localStorage.getItem("fw_preferred_model"); if (m) setSelectedModel(m);
    // Restore last conversation
    const lastConv = localStorage.getItem("fw_last_conversation");
    if (lastConv) loadConversation(lastConv);
  }, []);
  useEffect(() => {
    const unlock = () => { const c = new (window.AudioContext || (window as any).webkitAudioContext)(); c.resume().then(() => c.close()); document.removeEventListener("click", unlock); document.removeEventListener("touchstart", unlock); };
    document.addEventListener("click", unlock, { once: true }); document.addEventListener("touchstart", unlock, { once: true });
    return () => { document.removeEventListener("click", unlock); document.removeEventListener("touchstart", unlock); };
  }, []);
  useEffect(() => {
    // Scroll so the last user message aligns to the top of the chat area
    if (lastUserMsgRef.current) {
      lastUserMsgRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  /* ─── voice ─── */
  const toggleVoice = () => { const n = !voiceEnabled; setVoiceEnabled(n); localStorage.setItem("fw_voice_enabled", String(n)); if (!n && audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };

  // Use ref for voiceLang to avoid stale closures
  const voiceLangRef = useRef(voiceLang);
  useEffect(() => { voiceLangRef.current = voiceLang; }, [voiceLang]);

  const playTTS = async (text: string) => {
    if (!voiceEnabled || !text) return;
    try {
      const c = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#+\s/gm, "").replace(/^- /gm, "")
        .replace(/0x[a-fA-F0-9]{4,}[.]{0,3}[a-fA-F0-9]*/g, "").replace(/Tx:\s*\S+/g, "")
        .replace(/Not financial advice.*$/gm, "").replace(/AI analysis only\.?/g, "").replace(/Pas un conseil financier.*$/gm, "")
        .replace(/\n{2,}/g, ". ").replace(/\n/g, ". ").replace(/\.\s*\./g, ".").trim().slice(0, 300);
      if (!c) return;
      const vl = voiceLangRef.current;
      const lang = vl.startsWith("fr") ? "fr" : vl.startsWith("es") ? "es" : vl.startsWith("de") ? "de" : vl.startsWith("it") ? "it" : vl.startsWith("pt") ? "pt" : vl.startsWith("ar") ? "ar" : vl.startsWith("zh") ? "zh" : vl.startsWith("ja") ? "ja" : "en";
      console.log("[FW TTS] playing", { lang, voiceEnabled, textLen: c.length });
      const token = await getAccessToken();
      const r = await fetch(`${API_URL}/api/v1/chat/tts`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ text: c, language: lang }) });
      if (!r.ok) { console.warn("[FW TTS] API error", r.status); return; }
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      if (audioRef.current) audioRef.current.pause();
      const a = new Audio(url); audioRef.current = a;
      a.play().catch((e) => { console.warn("[FW TTS] play error", e); });
      a.onended = () => { URL.revokeObjectURL(url); if (voiceModeRef.current) { setTimeout(() => doStartListening(), 600); } };
    } catch (e) { console.warn("[FW TTS] error", e); }
  };

  const doStartListening = () => {
    // Stop any existing recognition first
    try { recognitionRef.current?.stop(); } catch {}
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.continuous = false; r.interimResults = true; r.lang = voiceLangRef.current; recognitionRef.current = r;
    r.onstart = () => setListening(true);
    r.onresult = (e: any) => { setInput(Array.from(e.results).map((x: any) => x[0].transcript).join("")); };
    r.onend = () => {
      setListening(false);
      // Auto-send what was captured
      setTimeout(() => {
        const btn = document.getElementById("chat-send-btn") || document.getElementById("chat-send-btn-active");
        btn?.click();
      }, 300);
    };
    r.onerror = (e: any) => {
      setListening(false);
      if (e.error === "no-speech" && voiceModeRef.current) {
        // No speech detected — retry in voice mode
        setTimeout(() => doStartListening(), 300);
      }
    };
    r.start();
  };

  // Keep startListening as useCallback wrapper for toggleListening dependency
  const startListening = useCallback(() => { doStartListening(); }, []);

  const toggleListening = useCallback(() => {
    if (listening || voiceMode) {
      // Stop voice mode
      recognitionRef.current?.stop();
      setListening(false);
      setVoiceMode(false);
      voiceModeRef.current = false;
      return;
    }
    // Start voice mode
    setVoiceMode(true);
    voiceModeRef.current = true;
    startListening();
  }, [listening, voiceMode, startListening]);

  /* ─── queries ─── */
  const personasQuery = useQuery({ queryKey: ["personas"], queryFn: async () => { const r = await apiClient.get<{ personas: PersonaOption[] }>("/api/v1/agents/personas"); if (r.error) throw new Error(r.error); return r.data?.personas ?? []; }, retry: false, enabled: ready && authenticated });
  const conversations = useQuery({ queryKey: ["conversations"], queryFn: async () => { const r = await apiClient.get<{ conversations: Conversation[] }>("/api/v1/chat/conversations"); if (r.error) throw new Error(r.error); return r.data?.conversations ?? []; }, retry: false, enabled: ready && authenticated });

  // Portfolio data for balance bar + wallet overlay
  const pnlQuery = useQuery({ queryKey: ["pnl-chat"], queryFn: async () => { const r = await apiClient.get<{ total_market_value: number; total_unrealized_pnl: number; total_unrealized_pnl_pct: number; position_count: number }>("/api/v1/portfolio/pnl"); if (r.error) throw new Error(r.error); return r.data; }, retry: false, enabled: ready && authenticated, refetchInterval: 30000 });
  const portfolioQuery = useQuery({ queryKey: ["portfolio-chat"], queryFn: async () => { const r = await apiClient.get<{ positions: Array<{ symbol: string; asset: string; quantity: number; value: number; pnl_percent: number }> ; total_value: number }>("/api/v1/portfolio"); if (r.error) throw new Error(r.error); return r.data; }, retry: false, enabled: ready && authenticated && walletOpen, refetchInterval: 30000 });

  const signalsQuery = useQuery({ queryKey: ["social-signals"], queryFn: async () => { const r = await apiClient.get<{ signals: Array<{ id: string; symbol: string; sentiment_score: number; summary: string; post_count: number; trending?: string[]; created_at: string }> }>("/api/v1/social/signals?limit=20"); if (r.error) throw new Error(r.error); return r.data?.signals ?? []; }, retry: false, enabled: ready && authenticated && signalsOpen, refetchInterval: 60000 });

  const totalValue = pnlQuery.data?.total_market_value ?? 0;
  const totalPnl = pnlQuery.data?.total_unrealized_pnl ?? 0;
  const totalPnlPct = pnlQuery.data?.total_unrealized_pnl_pct ?? 0;

  const walletAddress = user?.address || "";
  const handleCopy = async () => { if (!walletAddress) return; await navigator.clipboard.writeText(walletAddress); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  /* ─── actions ─── */
  const loadConversation = async (convId: string) => {
    setConversationId(convId); setPanelOpen(false); setError(null); localStorage.setItem("fw_last_conversation", convId);
    const r = await apiClient.get<{ conversation: Conversation; messages: Array<{ id: string; role: string; content: string; created_at: string; metadata?: Record<string, any> }> }>(`/api/v1/chat/conversations/${convId}/messages`);
    if (r.error) { setError("Failed to load conversation"); return; }
    setMessages((r.data?.messages ?? []).map((m) => ({ id: m.id, role: m.role as "user"|"assistant", content: m.content, created_at: m.created_at, requires_confirmation: m.metadata?.requires_confirmation, confirmation_id: m.metadata?.confirmation_token, confirmed: m.metadata?.confirmation_token ? true : undefined, trade_details: m.metadata?.trade_intent ? { asset: m.metadata.trade_intent.symbol, side: m.metadata.trade_intent.side, quantity: m.metadata.trade_intent.amount ?? m.metadata.trade_intent.quantity ?? 0, estimated_price: m.metadata.trade_intent.estimated_price ?? 0, estimated_total: m.metadata.trade_intent.estimated_total ?? 0 } : undefined })));
  };
  const startNewChat = () => { setConversationId(null); setMessages([]); setError(null); setPanelOpen(false); localStorage.removeItem("fw_last_conversation"); };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // don't trigger loadConversation
    try {
      // Delete from Firestore via API — use the conversations endpoint
      await apiClient.delete(`/api/v1/chat/conversations/${convId}`);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      // If we deleted the active conversation, clear the chat
      if (conversationId === convId) {
        setConversationId(null);
        setMessages([]);
        localStorage.removeItem("fw_last_conversation");
      }
    } catch {
      // If API doesn't have delete endpoint yet, remove from UI anyway
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  };

  const sendMessage = async () => {
    const text = input.trim(); if (!text || sending) return;
    setMessages((p) => [...p, { id: crypto.randomUUID(), role: "user", content: text, created_at: new Date().toISOString() }]);
    setInput(""); setSending(true); setError(null);
    const r = await apiClient.post<ChatApiResponse>("/api/v1/chat/message", { message: text, persona_id: selectedPersona, conversation_id: conversationId, model: selectedModel });
    if (r.error) { setSending(false); setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: r.error || "Something went wrong." }]); setTimeout(() => inputRef.current?.focus(), 100); return; }
    if (r.data) {
      if (r.data.conversation_id && !conversationId) { setConversationId(r.data.conversation_id); localStorage.setItem("fw_last_conversation", r.data.conversation_id); queryClient.invalidateQueries({ queryKey: ["conversations"] }); }
      // Debug: log the trade intent from backend
      if (r.data.trade_intent) {
        console.log("[FW v50] trade_intent:", JSON.stringify(r.data.trade_intent));
        console.log("[FW v50] estimated_total:", r.data.trade_intent.estimated_total, "dollar_amount:", r.data.trade_intent.dollar_amount, "is_dollar:", r.data.trade_intent.is_dollar_amount);
      }
      const ti = r.data!.trade_intent;
      // For dollar trades: force total to the dollar amount, ignore backend estimated_total
      const computedTotal = (ti?.is_dollar_amount && ti?.dollar_amount) ? ti.dollar_amount : (ti?.estimated_total ?? 0);
      console.log("[FW v50] computedTotal:", computedTotal, "from dollar_amount:", ti?.dollar_amount, "or estimated_total:", ti?.estimated_total);
      const tradeDetails = ti ? {
        asset: ti.symbol,
        side: ti.side,
        quantity: ti.amount,
        estimated_price: ti.estimated_price ?? 0,
        estimated_total: computedTotal,
      } : undefined;
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: r.data!.reply, isNew: true, requires_confirmation: r.data!.requires_confirmation, confirmation_id: r.data!.confirmation_token || undefined, trade_details: tradeDetails, created_at: new Date().toISOString() }]);
      // Only play TTS for non-trade responses (trade cards don't need voice)
      if (!r.data!.requires_confirmation) {
        playTTS(r.data.reply);
        // If voice mode but TTS disabled, restart listening manually
        if (voiceModeRef.current && !voiceEnabled) { setTimeout(() => startListening(), 500); }
      } else if (voiceModeRef.current) {
        // Trade card shown — restart listening for next voice command
        setTimeout(() => startListening(), 500);
      }
    }
    setSending(false);
    // Focus input after response is fully received and rendered
    setTimeout(() => { inputRef.current?.focus(); }, 150);
  };

  const confirmTrade = async (cid: string, approve: boolean) => {
    setSending(true); setError(null);

    const r = await apiClient.post<{
      status: string; trade_id?: string; message: string;
      unsigned_tx?: { to: string; value: number; data: string; chainId: number; gas?: number } | null;
      approval_tx?: { to: string; value: number; data: string; chainId: number; gas?: number } | null;
    }>("/api/v1/chat/confirm", { confirmation_token: cid, confirmed: approve });

    if (r.error) { setSending(false); setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: r.error || "Something went wrong." }]); setTimeout(() => inputRef.current?.focus(), 150); return; }

    // If backend returned an unsigned tx for client-side signing
    if (r.data?.status === "sign_required" && r.data.unsigned_tx) {
      // Wallet signing is not yet wired up — Kohaku/Ambire integration is in progress
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: "Transaction signing is not yet available. Wallet integration is in progress." }]);
      await apiClient.post("/api/v1/chat/report-trade", { confirmation_token: cid, tx_hash: "", status: "failed" });
    } else {
      // Non-swap confirmations (send, cancel, etc.)
      setMessages((p) => p.map((m) => m.confirmation_id === cid ? { ...m, confirmed: true } : m));
      if (r.data) setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: r.data!.message }]);
    }

    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const askAI = async (tradeDetails: { asset: string; side: string; quantity: number; estimated_price: number }) => {
    setSending(true);
    const prompt = `Should I ${tradeDetails.side} ${tradeDetails.quantity} ${tradeDetails.asset} at $${tradeDetails.estimated_price}? Quick take.`;
    const r = await apiClient.post<ChatApiResponse>("/api/v1/chat/message", { message: prompt, persona_id: selectedPersona, conversation_id: conversationId, model: selectedModel });
    if (r.data) {
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: r.data!.reply, isNew: true }]);
      playTTS(r.data.reply);
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const convList = conversations.data ?? [];
  const personas = personasQuery.data ?? [];

  const handlePersonaChip = (c: typeof PERSONA_CHIPS[0]) => { setSelectedPersona(c.id); setTimeout(() => inputRef.current?.focus(), 50); };
  const handleActionChip = (c: typeof ACTION_CHIPS[0]) => { setInput(c.prefill); setTimeout(() => inputRef.current?.focus(), 50); };

  /* ─── render ─── */
  return (
    <>
      {/* NavSidebar removed — chat has its own panel with all features */}

      {/* ── LEFT PANEL (Claude/ChatGPT style) ── */}
      {panelOpen && <div className="fixed inset-0 z-[70] bg-black/50" onClick={() => setPanelOpen(false)} />}
      <aside className={`fixed top-0 left-0 z-[71] h-full w-72 bg-card border-r border-border flex flex-col transition-transform duration-200 ${panelOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* title */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">FutureWallet</span>
            </div>
            <button onClick={() => setPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* nav items */}
        <div className="px-3 space-y-0.5">
          <button onClick={startNewChat} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-accent transition-colors text-foreground">
            <Plus className="h-4 w-4" /> New Chat
          </button>
          <Link href="/trades" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <ArrowUpRight className="h-4 w-4" /> Trades
          </Link>
          <Link href="/personas" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Users className="h-4 w-4" /> Personas
          </Link>
        </div>

        {/* recent chats */}
        <div className="mt-4 px-4">
          <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">Recents</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 mt-2 space-y-0.5">
          {conversations.isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : convList.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No chats yet</p>
          ) : convList.map((conv) => (
            <div key={conv.id} className={`group flex items-center rounded-xl transition-colors ${conversationId === conv.id ? "bg-primary/10" : "hover:bg-accent"}`}>
              <button onClick={() => loadConversation(conv.id)}
                className={`flex-1 text-left px-3 py-2 text-sm truncate ${conversationId === conv.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {conv.title}
              </button>
              <button onClick={(e) => deleteConversation(conv.id, e)}
                className="shrink-0 p-1.5 mr-1 rounded-lg text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive hover:bg-destructive/10 transition-all"
                title="Delete chat">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* bottom: settings + version */}
        <div className="border-t border-border/40 p-3">
          <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Settings className="h-4 w-4" /> Settings
          </Link>
          <div className="px-3 mt-2"><BuildVersion /></div>
        </div>
      </aside>

      {/* ── MAIN CHAT AREA ── */}
      <main className="flex flex-col bg-background overflow-hidden" style={{ height: "100dvh" }}>

        {/* ── top bar (always visible) ── */}
        <div className="shrink-0 px-4 py-2 flex items-center justify-between border-b border-border/30 bg-background z-30">
          <div className="flex items-center gap-2">
            <button onClick={() => setPanelOpen(true)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-foreground/70">FutureWallet</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setSignalsOpen(true)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground relative" title="Social Signals">
              <Bell className="h-5 w-5" />
              {(signalsQuery.data?.length ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
            <button onClick={() => setWalletOpen(true)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground" title="Wallet">
              <Wallet className="h-5 w-5" />
            </button>
            <button onClick={startNewChat} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground" title="New chat">
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── balance bar ── */}
        <div className="shrink-0 px-4 py-1.5 flex items-center justify-between border-b border-border/20 bg-card/80 z-30">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold tabular-nums">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className={`text-xs tabular-nums flex items-center gap-0.5 ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
              {totalPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {totalPnl >= 0 ? "+" : ""}{totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { setInput("send "); setTimeout(() => inputRef.current?.focus(), 50); }} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <ArrowUpFromLine className="h-3.5 w-3.5" /> Send
            </button>
            <button onClick={() => setShowReceive(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <ArrowDownToLine className="h-3.5 w-3.5" /> Receive
            </button>
          </div>
        </div>

        {/* ── wallet overlay (iOS bottom sheet) ── */}
        {walletOpen && (
          <>
            <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => setWalletOpen(false)} />
            <div className="fixed bottom-0 left-0 right-0 z-[61] animate-in slide-in-from-bottom duration-300">
              <div className="bg-card border-t border-border rounded-t-2xl max-h-[75vh] flex flex-col shadow-2xl">
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-muted-foreground/30" /></div>
                <div className="flex items-center justify-between px-5 pb-2">
                  <p className="text-base font-semibold">Wallet</p>
                  <button onClick={() => setWalletOpen(false)} className="p-1.5 rounded-full hover:bg-accent text-muted-foreground"><X className="h-5 w-5" /></button>
                </div>
                {/* balance summary */}
                <div className="px-5 pb-4 text-center">
                  <p className="text-3xl font-bold tabular-nums">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className={`text-sm tabular-nums mt-1 ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                    PnL {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%)
                  </p>
                  {/* address */}
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <code className="text-xs text-muted-foreground">{walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "No wallet"}</code>
                    {walletAddress && (
                      <button onClick={handleCopy} className="p-1 rounded hover:bg-accent">
                        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                      </button>
                    )}
                  </div>
                </div>
                {/* assets list */}
                <div className="flex-1 overflow-y-auto px-5 pb-8">
                  <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">Assets</p>
                  {portfolioQuery.isLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  ) : (portfolioQuery.data?.positions ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No assets yet</p>
                  ) : (
                    <div className="space-y-2">
                      {(portfolioQuery.data?.positions ?? []).map((pos) => (
                        <div key={pos.symbol} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                          <div>
                            <p className="text-sm font-medium">{pos.symbol}</p>
                            <p className="text-xs text-muted-foreground">{pos.quantity} units</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium tabular-nums">${(pos.value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <p className={`text-xs tabular-nums ${(pos.pnl_percent ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {(pos.pnl_percent ?? 0) >= 0 ? "+" : ""}{(pos.pnl_percent ?? 0).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── receive modal ── */}
        {showReceive && (
          <>
            <div className="fixed inset-0 z-[60] bg-black/60" onClick={() => setShowReceive(false)} />
            <div className="fixed left-1/2 top-1/2 z-[61] w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-lg">
              <h3 className="text-lg font-semibold mb-1">Receive</h3>
              <p className="text-xs text-muted-foreground mb-4">Send tokens to this address on Ethereum.</p>
              <div className="rounded-lg border bg-muted/50 p-3 flex items-center gap-2">
                <code className="text-xs break-all flex-1 text-foreground">{walletAddress || "No wallet"}</code>
                {walletAddress && <button onClick={handleCopy} className="shrink-0 rounded-md p-1.5 hover:bg-accent">{copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}</button>}
              </div>
              {copied && <p className="text-xs text-green-500 mt-2">Copied!</p>}
              <button onClick={() => setShowReceive(false)} className="mt-4 w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Done</button>
            </div>
          </>
        )}

        {/* ── signals overlay (iOS bottom sheet) ── */}
        {signalsOpen && (
          <>
            <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => setSignalsOpen(false)} />
            <div className="fixed bottom-0 left-0 right-0 z-[61] animate-in slide-in-from-bottom duration-300">
              <div className="bg-card border-t border-border rounded-t-2xl max-h-[75vh] flex flex-col shadow-2xl">
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-muted-foreground/30" /></div>
                <div className="flex items-center justify-between px-5 pb-3">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    <p className="text-base font-semibold">Social Signals</p>
                  </div>
                  <button onClick={() => setSignalsOpen(false)} className="p-1.5 rounded-full hover:bg-accent text-muted-foreground"><X className="h-5 w-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 pb-8">
                  {signalsQuery.isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : (signalsQuery.data?.length ?? 0) === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No signals yet</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Signals appear when you trade — the AI analyzes X/Twitter sentiment.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(signalsQuery.data ?? []).map((sig) => (
                        <div key={sig.id} className="rounded-xl border border-border/40 p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-semibold">{sig.symbol}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                sig.sentiment_score > 0.2 ? "bg-green-500/15 text-green-500"
                                : sig.sentiment_score < -0.2 ? "bg-red-500/15 text-red-500"
                                : "bg-muted text-muted-foreground"
                              }`}>
                                {sig.sentiment_score > 0.2 ? "Bullish" : sig.sentiment_score < -0.2 ? "Bearish" : "Neutral"} {sig.sentiment_score.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-muted-foreground/50">{sig.post_count} posts</span>
                            </div>
                          </div>
                          {sig.summary && <p className="text-xs text-muted-foreground leading-relaxed">{sig.summary}</p>}
                          {sig.trending && sig.trending.length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {sig.trending.map((t, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/50 text-muted-foreground">{t}</span>
                              ))}
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground/40 mt-2">{new Date(sig.created_at).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── EMPTY STATE ── */}
        {!hasMessages && (
          <div className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
            <h1 className="text-2xl font-semibold text-foreground mb-6 tracking-tight">
              Ready to trade?
            </h1>

            {/* persona chips — big memoji centered */}
            <div className="flex justify-center gap-6 mb-8 max-w-2xl">
              {PERSONA_CHIPS.map((c) => (
                <button key={c.id} onClick={() => handlePersonaChip(c)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all hover:bg-primary/5 ${selectedPersona === c.id ? "bg-primary/10 ring-2 ring-primary" : ""}`}>
                  <img src={c.img} alt={c.label} className="h-16 w-16 rounded-full object-cover" />
                  <span className={`text-xs font-medium ${selectedPersona === c.id ? "text-primary" : "text-muted-foreground"}`}>{c.label}</span>
                </button>
              ))}
            </div>

            {/* input bar */}
            <div className="w-full max-w-2xl mx-auto">
              <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur shadow-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3">
                  <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="Buy, sell, send, or ask me anything..." disabled={sending}
                    className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/50 h-8" autoFocus />
                  {/* language + voice button */}
                  <LangDropdown value={voiceLang} onChange={setVoiceLang} />
                  <button onClick={input.trim() ? sendMessage : toggleListening} id="chat-send-btn"
                    className={`p-2.5 rounded-full transition-all ${
                      listening ? "bg-destructive/20 text-destructive animate-pulse"
                      : input.trim() ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "bg-accent/60 text-muted-foreground hover:text-foreground"
                    }`}>
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" />
                      : listening ? <MicOff className="h-5 w-5" />
                      : input.trim() ? <Send className="h-5 w-5" />
                      : <Mic className="h-5 w-5" />}
                  </button>
                </div>
                {/* toolbar */}
                <div className="flex items-center justify-between px-3 pb-2">
                  <PersonaDropdown value={selectedPersona} onChange={setSelectedPersona} personas={personas} />
                  <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
                </div>
              </div>
            </div>

            {/* action chips */}
            <div className="flex flex-wrap justify-center gap-2 mt-5 max-w-2xl">
              {ACTION_CHIPS.map((c) => (
                <button key={c.label} onClick={() => handleActionChip(c)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/40 text-xs text-muted-foreground transition-all hover:border-border hover:text-foreground hover:bg-accent/50">
                  <span>{c.emoji}</span><span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── ACTIVE CHAT ── */}
        {hasMessages && (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-6" style={{ paddingBottom: "80vh" }}>
                {messages.map((msg, idx) => {
                  const isLastUser = msg.role === "user" && !messages.slice(idx + 1).some(m => m.role === "user");
                  return (
                  <div key={msg.id} ref={isLastUser ? lastUserMsgRef : undefined} style={isLastUser ? { scrollMarginTop: "8px" } : undefined}>
                    {msg.role === "user" ? (
                      <div className="flex flex-col items-end">
                        <div className="bg-primary/15 text-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[75%] whitespace-pre-wrap">
                          {msg.content}
                        </div>
                        {msg.created_at && <p className="text-[10px] text-muted-foreground/40 mt-1 mr-1">{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
                      </div>
                    ) : (
                      <div className="flex gap-3 items-start">
                        {selectedPersona && PERSONA_CHIPS.find(p => p.id === selectedPersona)?.img ? (
                          <img src={PERSONA_CHIPS.find(p => p.id === selectedPersona)!.img} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 mt-0.5" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Bot className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap min-w-0">
                          {msg.requires_confirmation && msg.trade_details ? (
                            <Card className="border-border/60 w-full max-w-lg">
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <p className="font-medium text-sm">Confirmation</p>
                                  <Badge variant={msg.trade_details.side === "buy" ? "secondary" : "destructive"}>{msg.trade_details.side.toUpperCase()}</Badge>
                                </div>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between"><span className="text-muted-foreground">Asset</span><span>{msg.trade_details.asset}</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Qty</span><span>{msg.trade_details.quantity}</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span>${(msg.trade_details.estimated_price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span></div>
                                  <div className="flex justify-between font-medium border-t border-border/40 pt-1"><span>Total</span><span>${(msg.trade_details.estimated_total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span></div>
                                </div>
                                {!msg.confirmed && msg.confirmation_id && (
                                  <div className="flex items-center justify-between mt-2">
                                    <Button variant="outline" size="sm" className="h-9 text-xs rounded-xl" onClick={() => askAI(msg.trade_details!)} disabled={sending}>
                                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                                      {selectedPersona === "elon" ? "Ask Elon" : selectedPersona === "buffett" ? "Ask Warren" : selectedPersona === "ai_momentum" ? "Ask AI" : "Ask AI"}
                                    </Button>
                                    <div className="flex gap-2">
                                      <Button variant="outline" size="sm" className="h-9 text-xs rounded-xl" onClick={() => confirmTrade(msg.confirmation_id!, false)} disabled={sending}><XCircle className="mr-1 h-3.5 w-3.5" /> Cancel</Button>
                                      <Button size="sm" className="h-9 text-xs rounded-xl" onClick={() => confirmTrade(msg.confirmation_id!, true)} disabled={sending}><CheckCircle className="mr-1 h-3.5 w-3.5" /> Confirm</Button>
                                    </div>
                                  </div>
                                )}
                                {msg.confirmed && <p className="text-xs text-muted-foreground text-center">Submitted</p>}
                              </CardContent>
                            </Card>
                          ) : (
                            <>
                              {(() => { const c = cleanContent(msg.content); return msg.isNew ? <TypewriterText text={c} speed={12} /> : c; })()}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
                {sending && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Thinking...</span></div>}
                {/* errors shown as assistant messages, no red banner */}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* ── bottom input (fixed) ── */}
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/30 bg-background/95 backdrop-blur-md px-4 py-3 safe-area-pb">
              <div className="max-w-3xl mx-auto">
                <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur shadow-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2">
                  <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="Buy, sell, send, or ask me anything..." disabled={sending}
                    className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/50 h-8" autoFocus />
                  {/* language selector */}
                  <LangDropdown value={voiceLang} onChange={setVoiceLang} />
                  {/* voice / send button */}
                  <button onClick={input.trim() ? sendMessage : toggleListening} id="chat-send-btn-active"
                    className={`p-2.5 rounded-full transition-all ${
                      listening ? "bg-destructive/20 text-destructive animate-pulse"
                      : input.trim() ? "bg-primary text-primary-foreground hover:opacity-90"
                      : voiceMode ? "bg-green-500/20 text-green-500 ring-2 ring-green-500/50"
                      : "bg-accent/60 text-muted-foreground hover:text-foreground"
                    }`}>
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" />
                      : listening ? <MicOff className="h-5 w-5" />
                      : input.trim() ? <Send className="h-5 w-5" />
                      : <Mic className="h-5 w-5" />}
                  </button>
                  </div>
                  {/* toolbar */}
                  <div className="flex items-center justify-between px-3 pb-2">
                    <PersonaDropdown value={selectedPersona} onChange={setSelectedPersona} personas={personas} />
                    <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
