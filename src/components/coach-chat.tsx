"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/i18n-provider";
import { clearCoachAction, sendCoachMessageAction } from "@/lib/actions";

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

export function CoachChat({
  activityId,
  messages: initial,
  configured,
}: {
  activityId: number;
  messages: CoachMessage[];
  configured: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [messages, setMessages] = useState<CoachMessage[]>(initial);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();

  if (!configured) {
    return <p className="text-sm text-muted-foreground/70">{t.coach.notConfigured}</p>;
  }

  function send() {
    const message = input.trim();
    if (!message || pending) return;
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    startTransition(async () => {
      const result = await sendCoachMessageAction({ activityId, message });
      if (!result.ok) {
        toast.error(result.error);
        setMessages((prev) => prev.slice(0, -1));
        setInput(message);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
      router.refresh();
    });
  }

  function clear() {
    startTransition(async () => {
      const result = await clearCoachAction(activityId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setMessages([]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {messages.length > 0 ? (
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                    : "max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {pending ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
                {t.coach.thinking}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/70">{t.coach.empty}</p>
      )}

      <div className="space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={t.coach.placeholder}
          className="min-h-20 resize-y"
          disabled={pending}
        />
        <div className="flex items-center justify-between gap-2">
          {messages.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={clear} disabled={pending}>
              {t.coach.clear}
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={send} disabled={pending || !input.trim()}>
            {pending ? (
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
            ) : (
              <SendIcon data-icon="inline-start" />
            )}
            {t.coach.send}
          </Button>
        </div>
      </div>
    </div>
  );
}
