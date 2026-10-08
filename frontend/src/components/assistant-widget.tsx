import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2, MessageCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { assistantApi } from "@/api/trust";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "What is waiting for review?",
  "How are our targets going?",
  "Which photos need a second look, and why?",
  "What does 'needs a second look' mean?",
];

/** Where in the app a question is best answered, offered as a link under the reply. */
function destination(text: string) {
  const t = text.toLowerCase();
  if (/review|approve|reject/.test(t)) return { to: "/app/review", label: "Open Review" };
  if (/target|tally|count|how many/.test(t)) return { to: "/app/projects", label: "Open Projects" };
  if (/claim|donor|report/.test(t)) return { to: "/app/claims", label: "Open Claim checker" };
  if (/story|campaign|card|poster/.test(t)) return { to: "/app/story", label: "Open Story Studio" };
  if (/member|role|invite|team|organization/.test(t)) return { to: "/app/organization", label: "Open Organization" };
  if (/photo|evidence|upload|trust|flag/.test(t)) return { to: "/app/library", label: "Open Evidence Library" };
  return null;
}

/**
 * Floating assistant. Answers come from the organization's own numbers via
 * the backend; the model never sees other organizations and cannot act on
 * anything, so a wrong answer is at worst an unhelpful one.
 */
export function AssistantWidget() {
  const { membership } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const ask = useMutation({
    mutationFn: (history: Message[]) => assistantApi.chat(history),
    onSuccess: ({ reply }) => setMessages((current) => [...current, { role: "assistant", content: reply }]),
    onError: (error) => setMessages((current) => [...current, { role: "assistant", content: `I could not answer right now (${error.message}). Try again in a moment.` }]),
  });
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);
  // A different organization means different facts; start the conversation over.
  useEffect(() => { setMessages([]); }, [membership?.organization.id]);
  const send = (text: string) => {
    const content = text.trim();
    if (!content || ask.isPending) return;
    const history = [...messages, { role: "user" as const, content }];
    setMessages(history);
    setInput("");
    ask.mutate(history.slice(-10));
  };
  const submit = (event: FormEvent) => { event.preventDefault(); send(input); };
  if (!membership) return null;
  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.section
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            role="dialog"
            aria-label="FieldProof assistant"
            className="fixed bottom-24 right-4 z-40 flex h-[min(560px,calc(100vh-7rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[26px] border border-black/10 bg-white shadow-soft"
          >
            <header className="flex items-center justify-between border-b border-black/[.06] bg-ink px-4 py-3 text-white">
              <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-lime text-ink"><Bot size={16} /></span><div><p className="text-sm font-bold">FieldProof assistant</p><p className="text-[11px] text-white/50">Answers from {membership.organization.name}'s own numbers</p></div></div>
              <button aria-label="Close assistant" onClick={() => setOpen(false)} className="rounded-full p-1.5 hover:bg-white/10"><X size={17} /></button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {!messages.length && (
                <div className="space-y-2">
                  <p className="text-sm text-stone">Ask about your projects, evidence, review queue or targets. I only use this organization's data and never change anything.</p>
                  {STARTERS.map((starter) => <button key={starter} onClick={() => send(starter)} className="block w-full rounded-xl border border-black/[.08] px-3 py-2 text-left text-sm hover:bg-fog">{starter}</button>)}
                </div>
              )}
              {messages.map((message, index) => {
                const link = message.role === "assistant" ? destination(messages[index - 1]?.content ?? "") : null;
                return (
                  <motion.div key={index} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-6", message.role === "user" ? "whitespace-pre-wrap bg-ink text-white" : "bg-fog text-ink")}>
                      {message.role === "user" ? message.content : <Markdown text={message.content} />}
                      {link && <Link to={link.to} onClick={() => setOpen(false)} className="mt-2 block text-xs font-bold text-emerald-700 hover:underline">{link.label} →</Link>}
                    </div>
                  </motion.div>
                );
              })}
              {ask.isPending && <div className="flex items-center gap-2 text-xs text-stone"><Loader2 size={14} className="animate-spin" />Looking at your data…</div>}
              <div ref={endRef} />
            </div>
            <form onSubmit={submit} className="flex items-center gap-2 border-t border-black/[.06] p-3">
              <input aria-label="Ask the assistant" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about your evidence…" className="field py-2.5" maxLength={2000} />
              <button type="submit" aria-label="Send" disabled={!input.trim() || ask.isPending} className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-lime disabled:opacity-40"><Send size={16} /></button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        aria-label={open ? "Close assistant" : "Open assistant"}
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-5 right-4 z-40 flex items-center gap-2 rounded-full bg-ink py-3 pl-4 pr-5 text-sm font-bold text-white shadow-soft"
      >
        <span className="grid size-7 place-items-center rounded-full bg-lime text-ink">{open ? <X size={15} /> : <MessageCircle size={15} />}</span>
        Ask FieldProof
      </motion.button>
    </>
  );
}

/** The assistant replies in light markdown: paragraphs, bullet lists and **bold**. Nothing else is interpreted. */
function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
      part.startsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong>
        : part.startsWith("`") ? <code key={index} className="rounded bg-black/[.06] px-1 text-[12px]">{part.slice(1, -1)}</code>
          : <span key={index}>{part}</span>);
  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter(Boolean);
        const list = lines.length > 0 && lines.every((line) => /^\s*([*•-]|\d+[.)])\s+/.test(line));
        if (list)
          return <ul key={index} className="list-disc space-y-1 pl-4">{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*([*•-]|\d+[.)])\s+/, ""))}</li>)}</ul>;
        return <p key={index}>{lines.map((line, i) => <span key={i}>{inline(line)}{i < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </div>
  );
}
