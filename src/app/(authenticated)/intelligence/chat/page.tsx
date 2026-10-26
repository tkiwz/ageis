import { ChatInterface } from "@/components/ai/chat-interface";
import { Brain } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export default async function IntelligenceChatPage() {
  const t = await getT();
  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-start gap-4">
        <div className="rounded-md border border-primary/30 bg-primary/10 p-3">
          <Brain className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-3xl tracking-tight">{t("intel.chat.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("intel.chat.subtitle")}</p>
        </div>
      </div>
      <ChatInterface />
    </div>
  );
}
