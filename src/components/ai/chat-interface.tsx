"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send, Brain, User, Loader2, Sparkles, AlertCircle,
  Copy, Check, RotateCcw, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatResponse } from "@/types/ai";
import type { ApiResponse } from "@/types";

const STORAGE_KEY = "aegis-chat-history";
const MAX_STORED_MESSAGES = 50;

const SUGGESTED_PROMPTS = [
  { ar: "كم موقع لدينا في عُمان؟", en: "How many sites do we have in Oman?" },
  { ar: "ما هي بروتوكولات تسرب النفط؟", en: "What are oil spill response protocols?" },
  { ar: "اشرح إجراءات الإخلاء", en: "Explain evacuation procedures" },
  { ar: "كيف نتعامل مع ارتفاع الغاز؟", en: "How do we handle elevated gas levels?" },
];

// ─── Utilities ───
function isRTL(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text.slice(0, 100));
}

// ─── Markdown Renderer (no external library) ───
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let lastIdx = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(<code key={key++} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("*")) {
      parts.push(<em key={key++} className="italic">{token.slice(1, -1)}</em>);
    }
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <pre key={key++} className="my-2 overflow-x-auto rounded-md border border-border/40 bg-muted/40 p-3 text-xs font-mono">
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // Headings
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) { blocks.push(<h3 key={key++} className="mt-3 text-base font-semibold">{renderInline(h1[1])}</h3>); i++; continue; }
    if (h2) { blocks.push(<h4 key={key++} className="mt-2 text-sm font-semibold">{renderInline(h2[1])}</h4>); i++; continue; }

    // Numbered list
    const num = line.match(/^(\d+)\.\s+(.*)$/);
    if (num) {
      blocks.push(
        <div key={key++} className="flex gap-2 py-0.5">
          <span className="min-w-[1.25rem] text-muted-foreground">{num[1]}.</span>
          <span className="flex-1">{renderInline(num[2])}</span>
        </div>
      );
      i++; continue;
    }

    // Bullet
    const bullet = line.match(/^[\-\*•]\s+(.*)$/);
    if (bullet) {
      blocks.push(
        <div key={key++} className="flex gap-2 py-0.5">
          <span className="min-w-[1rem] text-muted-foreground">•</span>
          <span className="flex-1">{renderInline(bullet[1])}</span>
        </div>
      );
      i++; continue;
    }

    if (line.trim() === "") { blocks.push(<div key={key++} className="h-2" />); i++; continue; }
    blocks.push(<div key={key++} className="py-0.5">{renderInline(line)}</div>);
    i++;
  }
  return blocks;
}

// ─── Main Component ───
export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<{ in: number; out: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {}
  }, []);

  // Persist history
  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  async function sendMessage(text: string, retryFromIdx?: number) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    let messagesToSend: ChatMessage[];
    if (retryFromIdx !== undefined) {
      messagesToSend = messages.slice(0, retryFromIdx + 1);
      setMessages(messagesToSend);
    } else {
      messagesToSend = [...messages, { role: "user", content: trimmed }];
      setMessages(messagesToSend);
      setInput("");
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: messagesToSend }),
      });
      const json = (await res.json()) as ApiResponse<ChatResponse>;
      if (!json.ok || !json.data) throw new Error(json.error?.message ?? "AI request failed");

      setMessages((prev) => [...prev, { role: "assistant", content: json.data!.content }]);
      if (json.data.usage) {
        setLastUsage({ in: json.data.usage.inputTokens, out: json.data.usage.outputTokens });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    setLastUsage(null);
  }

  function retryLast() {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        sendMessage(messages[i].content, i);
        break;
      }
    }
  }

  return (
    <Card className="glass flex h-[calc(100vh-220px)] flex-col">
      <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-primary/30 bg-primary/10 p-2">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-base font-medium">AEGIS Intelligence</div>
            <div className="text-xs text-muted-foreground">Powered by SQAPS · HSSE Expert Assistant</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUsage && (
            <span className="hidden text-[10px] text-muted-foreground sm:inline num">
              {lastUsage.in + lastUsage.out} tokens
            </span>
          )}
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              New chat
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 px-6 py-6">
          {messages.length === 0 ? (
            <EmptyState onSelectPrompt={sendMessage} />
          ) : (
            messages.map((msg, i) => <MessageBubble key={i} message={msg} />)
          )}
          {loading && <LoadingBubble />}
          {error && <ErrorBubble error={error} onRetry={retryLast} />}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="border-t border-border/40 p-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AEGIS anything... (Enter to send, Shift+Enter for new line)"
            disabled={loading}
            rows={1}
            dir={isRTL(input) ? "rtl" : "ltr"}
            className={cn(
              "flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "max-h-[160px] min-h-[40px]",
            )}
          />
          <Button type="submit" disabled={loading || !input.trim()} className="shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const rtl = isRTL(message.content);

  function copy() {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={cn("group flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
        isUser ? "border-border bg-muted text-muted-foreground" : "border-primary/30 bg-primary/10 text-primary",
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Brain className="h-4 w-4" />}
      </div>
      <div className="flex max-w-[80%] flex-col gap-1">
        <div
          className={cn(
            "rounded-lg border px-4 py-2.5 text-sm leading-relaxed",
            isUser ? "border-primary/20 bg-primary/5" : "border-border/40 bg-background/50",
          )}
          dir={rtl ? "rtl" : "ltr"}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <div>{renderMarkdown(message.content)}</div>
          )}
        </div>
        {!isUser && (
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1 self-start text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          >
            {copied ? (<><Check className="h-3 w-3" /> Copied</>) : (<><Copy className="h-3 w-3" /> Copy</>)}
          </button>
        )}
      </div>
    </div>
  );
}

function LoadingBubble() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
        <Brain className="h-4 w-4 text-primary" />
      </div>
      <div className="rounded-lg border border-border/40 bg-background/50 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
}

function ErrorBubble({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-risk-critical/30 bg-risk-critical/10">
        <AlertCircle className="h-4 w-4 text-risk-critical" />
      </div>
      <div className="flex-1 rounded-lg border border-risk-critical/40 bg-risk-critical/5 px-4 py-2.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium text-risk-critical">Error</div>
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1 rounded-md border border-border/40 bg-background/50 px-2 py-1 text-xs transition-colors hover:bg-accent/30"
          >
            <RotateCcw className="h-3 w-3" /> Retry
          </button>
        </div>
        <div className="mt-1 text-muted-foreground">{error}</div>
      </div>
    </div>
  );
}

function EmptyState({ onSelectPrompt }: { onSelectPrompt: (p: string) => void }) {
  return (
    <div className="py-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <h3 className="font-display text-lg">Welcome to AEGIS Intelligence</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Ask anything about HSSE operations, safety protocols, or system status.
        <br />
        <span className="text-xs">Responds in Arabic or English. Press Enter to send, Shift+Enter for new line.</span>
      </p>
      <div className="mx-auto mt-6 flex max-w-md flex-col gap-3">
        {SUGGESTED_PROMPTS.map((p, i) => (
          <Button key={i} variant="outline" onClick={() => onSelectPrompt(p.en)}>
            {p.en}
          </Button>
        ))}
      </div>
    </div>
  );
}
