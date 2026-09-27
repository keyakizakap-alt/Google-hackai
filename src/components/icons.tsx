import { Eye, Heart, Hotel, Palette, Scissors, Sparkles, TrainFront } from "lucide-react";
import type { TimelineItem } from "@/lib/agent/types";

/** タイムライン項目の種別に対応するアイコン */
export function ItemIcon({ item, className = "h-5 w-5" }: { item: Pick<TimelineItem, "kind" | "category">; className?: string }) {
  const p = { className, strokeWidth: 1.7 };
  if (item.kind === "transit") return <TrainFront {...p} />;
  if (item.kind === "stay") return <Hotel {...p} />;
  if (item.kind === "event") return <Heart {...p} />;
  switch (item.category) {
    case "brow":
    case "eyelash":
      return <Eye {...p} />;
    case "hair":
      return <Scissors {...p} />;
    case "nail":
      return <Palette {...p} />;
    default:
      return <Sparkles {...p} />;
  }
}
