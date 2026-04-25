import { useEffect, useState } from "react";
import { checkShutdown, type ShutdownStatus } from "@/lib/neda/shutdown-check.functions";

interface Props {
  country: string;
}

const POLL_MS = 10 * 60 * 1000; // 10 minutes

export function ShutdownBanner({ country }: Props) {
  const [status, setStatus] = useState<ShutdownStatus | null>(null);

  useEffect(() => {
    if (!country) return;
    let cancelled = false;

    async function run() {
      try {
        const result = await checkShutdown({ data: { country } });
        if (!cancelled) setStatus(result);
      } catch (err) {
        console.error("shutdown check failed", err);
      }
    }

    run();
    const id = window.setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [country]);

  if (!status || !status.active) return null;

  const content = (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs uppercase tracking-wider text-white font-mono">
      <span className="flex items-center gap-2 min-w-0">
        <span className="neda-blink shrink-0">⚠</span>
        <span className="truncate">
          INTERNET SHUTDOWN DETECTED — {status.headline}
        </span>
      </span>
      {status.source && (
        <span className="shrink-0 text-[10px] underline opacity-80">SOURCE</span>
      )}
    </div>
  );

  const className =
    "block w-full text-left border-b border-black/40 shutdown-pulse";
  const style = { backgroundColor: "#ff2b2b" } as const;

  if (status.source) {
    return (
      <a
        href={status.source}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={style}
      >
        {content}
      </a>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}
