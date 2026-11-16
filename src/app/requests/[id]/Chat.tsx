"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";

/** Live chat for an accepted request. Row-level security decides who can read and write. */
export function Chat({
  requestId,
  meId,
  otherName,
  initial,
  open,
}: {
  requestId: string;
  meId: string;
  otherName: string;
  initial: Message[];
  open: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initial);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`request-${requestId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `request_id=eq.${requestId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "requests", filter: `id=eq.${requestId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [requestId, router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    const { data, error } = await createClient()
      .from("messages")
      .insert({ request_id: requestId, body: text })
      .select()
      .single();
    setSending(false);
    if (error) {
      setError("Couldn't send. This chat may be closed.");
      router.refresh();
      return;
    }
    setBody("");
    const m = data as Message;
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }

  return (
    <div className="card overflow-hidden">
      <div className="max-h-[50vh] min-h-32 space-y-2 overflow-y-auto bg-paper/60 p-4">
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">Say hello and agree a time and place with {otherName}.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <p
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] whitespace-pre-wrap ${
                  mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-card ring-1 ring-line"
                }`}
              >
                {m.body}
                <span className={`mt-0.5 block text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>
                  {new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                </span>
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {open ? (
        <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            className="input"
            placeholder={`Message ${otherName}`}
            aria-label="Message"
          />
          <button className="btn-primary" disabled={sending || !body.trim()}>Send</button>
        </form>
      ) : (
        <p className="border-t border-line p-3 text-center text-sm text-muted">This chat is closed.</p>
      )}
      {error && <p className="px-3 pb-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
