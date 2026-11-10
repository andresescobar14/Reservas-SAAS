import Link from "next/link";
import { CalendarCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";

export function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label={`${brand.name}, inicio`}
      className={cn(
        "inline-flex shrink-0 items-center gap-2.5 font-medium tracking-tight",
        light && "text-pure",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-pure">
        <CalendarCheck2 size={19} strokeWidth={2.2} />
      </span>
      {!compact && (
        <span aria-hidden="true" className="flex flex-col gap-0.5 text-left leading-none">
          <span className="text-lg">{brand.product}</span>
          <span className="text-xs tracking-wide text-primary">- {brand.company}</span>
        </span>
      )}
    </Link>
  );
}
