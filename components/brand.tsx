import Link from "next/link";
import { CalendarCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Reserva, inicio"
      className={cn(
        "inline-flex items-center gap-2.5 text-xl font-medium tracking-tight",
        light && "text-white",
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-700 text-white">
        <CalendarCheck2 size={19} strokeWidth={2.2} />
      </span>
      {!compact && (
        <>
          reserva<span className="-ml-2 text-emerald-600">.</span>
        </>
      )}
    </Link>
  );
}
