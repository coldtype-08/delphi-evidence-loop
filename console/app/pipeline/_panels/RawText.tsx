"use client";

import { useMemo } from "react";
import type { Block, Claim } from "../_lib/types";
import { BLOCK_TINT } from "../_lib/const";

export default function RawText({ text, blocks, claims, activeClaimId }: {
  text: string; blocks: Block[]; claims: Claim[]; activeClaimId?: string | null;
}) {
  const parts = useMemo(() => {
    type Mark = { start: number; end: number; kind: "block" | "claim"; i: number; label?: string };
    const marks: Mark[] = [
      ...blocks.map((b, i) => ({ start: b.charStart, end: b.charEnd, kind: "block" as const, i,
                                 label: b.hcpSurface })),
      ...claims.map((c, i) => ({ start: c.evidence.charStart, end: c.evidence.charEnd,
                                 kind: "claim" as const, i })),
    ].sort((a, b) => a.start - b.start || (a.kind === "block" ? -1 : 1));

    // 블록 위에 claim 하이라이트를 겹쳐 그린다 — 블록을 배경, claim을 형광펜으로
    const out: React.ReactNode[] = [];
    const blockMarks = marks.filter((m) => m.kind === "block");
    const claimMarks = marks.filter((m) => m.kind === "claim");
    let cursor = 0;

    const renderInner = (from: number, to: number, key: string) => {
      const inner: React.ReactNode[] = [];
      let c = from;
      for (const cm of claimMarks) {
        if (cm.start < from || cm.end > to) continue;
        if (cm.start > c) inner.push(text.slice(c, cm.start));
        inner.push(
          <mark key={`c${cm.i}`} id={`cmark-${claims[cm.i]?.id}`}
                className={`mono rounded-sm px-0.5 text-on-navy ${
                  activeClaimId && claims[cm.i]?.id === activeClaimId
                    ? "bg-navy ring-2 ring-orange" : "bg-orange"}`}>
            {text.slice(cm.start, cm.end)}
          </mark>,
        );
        c = cm.end;
      }
      if (c < to) inner.push(text.slice(c, to));
      return <span key={key}>{inner}</span>;
    };

    for (const bm of blockMarks) {
      if (bm.start > cursor) out.push(renderInner(cursor, bm.start, `g${bm.i}`));
      out.push(
        <span key={`b${bm.i}`} className="relative block rounded-md border-l-4 px-2 py-1"
              style={{ background: BLOCK_TINT[bm.i % BLOCK_TINT.length], borderColor: "var(--sky)" }}>
          <span className="mb-1 block text-[0.75rem] font-bold tracking-wide text-muted">
            블록 {bm.i + 1} · {bm.label}
          </span>
          {renderInner(bm.start, bm.end, `bi${bm.i}`)}
        </span>,
      );
      cursor = bm.end;
    }
    if (cursor < text.length) out.push(renderInner(cursor, text.length, "tail"));
    return out;
  }, [text, blocks, claims, activeClaimId]);

  return (
    <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg border border-glass-line
                    bg-card p-4 text-[0.875rem] leading-[1.8] text-ink">
      {parts}
    </pre>
  );
}
