"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, setMuted, playSound } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

export function SoundToggle() {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
  }, []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    // Play a click to confirm — only when un-muting
    if (!next) playSound("click");
  }

  const t = useT();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={muted ? t("header.unmute") : t("header.mute")}
      title={muted ? t("header.unmute") : t("header.mute")}
      className="relative text-muted-foreground"
    >
      {muted ? (
        <VolumeX className="h-[18px] w-[18px]" />
      ) : (
        <Volume2 className="h-[18px] w-[18px]" />
      )}
    </Button>
  );
}
