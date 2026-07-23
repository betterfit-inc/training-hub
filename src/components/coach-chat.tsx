"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlusIcon, Loader2Icon, SendIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/i18n-provider";
import { clearCoachAction, sendCoachMessageAction } from "@/lib/actions";

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
  /** Local-only preview (data URL) of an attached image; not persisted. */
  image?: string;
}

interface Attachment {
  base64: string;
  dataUrl: string;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
// Downscale on the client: keeps screenshots legible for the model while
// staying small (fast + cheap), and normalizes everything to JPEG.
const MAX_DIMENSION = 1400;

async function toDownscaledJpeg(file: File): Promise<Attachment> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("load failed"));
      el.src = url;
    });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    return { base64: dataUrl.split(",")[1] ?? "", dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
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
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  if (!configured) {
    return <p className="text-sm text-muted-foreground/70">{t.coach.notConfigured}</p>;
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same file be re-picked later
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_UPLOAD_BYTES) {
      toast.error(t.errors.invalidImage);
      return;
    }
    try {
      setAttachment(await toDownscaledJpeg(file));
    } catch {
      toast.error(t.errors.invalidImage);
    }
  }

  function send() {
    const message = input.trim();
    if ((!message && !attachment) || pending) return;
    const img = attachment;
    setMessages((prev) => [...prev, { role: "user", content: message, image: img?.dataUrl }]);
    setInput("");
    setAttachment(null);
    startTransition(async () => {
      const result = await sendCoachMessageAction({
        activityId,
        message,
        imageBase64: img?.base64 ?? null,
      });
      if (!result.ok) {
        toast.error(result.error);
        setMessages((prev) => prev.slice(0, -1));
        setInput(message);
        setAttachment(img);
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
                {m.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local data-URL preview, not a remote asset
                  <img
                    src={m.image}
                    alt=""
                    className="mb-1.5 max-h-48 rounded-lg border border-primary-foreground/20"
                  />
                ) : null}
                {m.content ? m.content : null}
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
        {attachment ? (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- local data-URL preview */}
            <img src={attachment.dataUrl} alt="" className="max-h-28 rounded-lg border" />
            <button
              type="button"
              onClick={() => setAttachment(null)}
              aria-label={t.coach.removeImage}
              className="absolute -top-2 -right-2 rounded-full border bg-background p-0.5 text-muted-foreground shadow-sm hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        ) : null}

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
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
          aria-hidden
        />
        <div className="flex items-center justify-between gap-2">
          {messages.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={clear} disabled={pending}>
              {t.coach.clear}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              aria-label={t.coach.attachImage}
              title={t.coach.attachImage}
            >
              <ImagePlusIcon />
            </Button>
            <Button onClick={send} disabled={pending || (!input.trim() && !attachment)}>
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
    </div>
  );
}
