"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Btn } from "@/app/components/ui";

export default function SegmentGapPanel({ contractActive, onQueued }: {
  contractActive: boolean; onQueued: () => void;
}) {
  type Gap = { segmentField: string; totalClaims: number; unspecifiedClaims: number;
               unmappedTerms: { surfaceForm: string; occurrenceCount: number }[];
               existingValues: { value: string; labelKo: string; labelScope: string }[] };
  type Proposed = { value: string; labelKo: string; coversKo: string; exampleQuote: string;
                    outOfLabelHint: boolean; outOfLabelReasonKo: string };
  const [gap, setGap] = useState<Gap | null>(null);
  const [proposed, setProposed] = useState<Proposed[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [oolPick, setOolPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    api<Gap>("/contract/segment-gap", { role: "DATA_STEWARD" })
      .then(setGap).catch(() => setGap(null));
  };

  const propose = async () => {
    setBusy("propose"); setErr(null); setProposed(null);
    try {
      const out = await api<{ proposed: Proposed[]; sampledQuotes: number; noteKo: string }>(
        "/contract/propose-segments", { method: "POST", role: "DATA_STEWARD" });
      setProposed(out.proposed);
      setPicked(new Set(out.proposed.map((v) => v.value)));
      setOolPick(new Set(out.proposed.filter((v) => v.outOfLabelHint).map((v) => v.value)));
      setNote(`미분류 인용문 ${out.sampledQuotes}건과 버려진 표현을 읽고 ${out.proposed.length}개 제안. ${out.noteKo}`);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBusy(null); }
  };

  const adopt = async () => {
    if (!proposed || !gap) return;
    setBusy("adopt"); setErr(null);
    try {
      for (const v of proposed.filter((x) => picked.has(x.value))) {
        await api("/contract/proposals", {
          method: "POST", role: "DATA_STEWARD",
          body: JSON.stringify({
            kind: "NEW_ENUM_VALUE", targetField: gap.segmentField, proposedValue: v.value,
            rationaleKo: v.coversKo,
            impactNoteKo: "환자군 공백 해소 — 승인하면 미분류에 묻힌 신호가 집계되기 시작합니다 (08/26)",
            // 허가 범위는 사람의 체크가 최종이다 — AI의 outOfLabelHint는 기본값일 뿐
            fieldSpec: { labelKo: v.labelKo,
                         labelScope: oolPick.has(v.value) ? "OUT_OF_LABEL" : "IN_LABEL" },
          }),
        });
      }
      setNote(`SCP 큐에 ${picked.size}건 올렸습니다 — 아래 심사에서 승인하면 새 버전에 반영됩니다.`);
      setProposed(null); onQueued();
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBusy(null); }
  };

  const reclassify = async () => {
    setBusy("reclassify"); setErr(null);
    setNote("되짚는 중 — 미분류 인용문을 묶음 단위로 대조합니다 (분 단위 소요)…");
    try {
      const out = await api<{ reclassifiedClaims: number; skippedQuotes: number;
                              remainingQuotes: number; perValue: Record<string, number>;
                              noteKo: string }>(
        "/contract/reclassify-segments", { method: "POST", role: "DATA_STEWARD",
                                           body: JSON.stringify({}) });
      const per = Object.entries(out.perValue).map(([k, n]) => `${k} ${n}건`).join(" · ");
      setNote(`되짚기 완료 — ${out.reclassifiedClaims}건 분류(${per || "없음"}) · `
        + `환자군 명시가 없어 미분류로 남은 인용문 ${out.skippedQuotes}건. ${out.noteKo}`);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBusy(null); }
  };

  const rollback = async () => {
    setBusy("rollback"); setErr(null);
    try {
      const out = await api<{ restored: number; noteKo: string }>(
        "/contract/reclassify-segments/rollback", { method: "POST", role: "DATA_STEWARD" });
      setNote(`되돌리기 완료 — ${out.restored}건을 미분류로 복원했습니다. ${out.noteKo}`);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBusy(null); }
  };

  const pct = gap && gap.totalClaims > 0
    ? Math.round((gap.unspecifiedClaims * 100) / gap.totalClaims) : 0;

  return (
    <details className="mt-2 w-full"
             onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !gap) load(); }}>
      <summary className="cursor-pointer text-xs font-bold text-navy">
        환자군 공백 해소 — 미분류에 묻힌 신호 꺼내기
      </summary>
      <p className="mt-2 text-[0.75rem] text-muted">
        스키마의 환자군 목록에 칸이 없으면 발언이 <b className="text-ink">미분류(UNSPECIFIED)</b>로
        낙착돼 어떤 집계·가설에도 잡히지 않습니다. 추출기가 버린 표현을 근거로 새 환자군 값을
        제안받고, 스키마 변경이 승인된 뒤 <b className="text-ink">[미분류 발언 분류하기]</b>로 이미 쌓인 발언을
        분류합니다 (환자군이 명시된 것만 — 명시 없는 발언은 미분류가 정답이라 그대로 둡니다).
      </p>
      {err && <p className="mt-1 text-[0.75rem] font-bold text-rust">{err}</p>}
      {note && <p className="mt-1 rounded bg-green-soft px-2 py-1 text-[0.75rem] font-bold text-green">{note}</p>}
      {gap && (
        <div className="mt-2 rounded-xl border border-glass-line bg-card p-2 text-[0.75rem]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-orange-soft px-1.5 py-0.5 font-bold text-orange">
              미분류 {gap.unspecifiedClaims.toLocaleString()}건 / 전체 {gap.totalClaims.toLocaleString()}건 ({pct}%)
            </span>
            <span className="text-muted">현재 환자군 값 {gap.existingValues.length}개 · 전부 SQL 집계</span>
            <Btn size="xs"  onClick={propose} disabled={!!busy || !contractActive}
                    className={`ml-auto`}>
              {busy === "propose" ? "읽는 중…" : "빠진 환자군 찾기"}
            </Btn>
            <Btn size="xs"  onClick={reclassify} disabled={!!busy || !contractActive}
                    title="승인된 환자군 목록으로 미분류 발언을 되짚습니다 — 인용문 묶음당 모델 1회 호출"
                    >
              {busy === "reclassify" ? "되짚는 중…" : "미분류 발언 분류하기"}
            </Btn>
            <Btn size="xs"  onClick={rollback} disabled={!!busy}
                    title="되짚기가 바꾼 claim만 미분류로 되돌립니다 — 원래 분류돼 있던 값은 그대로. 모델 호출 없음"
                    >
              {busy === "rollback" ? "되돌리는 중…" : "분류 되돌리기"}
            </Btn>
          </div>
          {gap.unmappedTerms.length > 0 && (
            <p className="mt-1 text-muted">
              추출기가 버린 환자군 표현(실제 기록):{" "}
              {gap.unmappedTerms.slice(0, 6).map((t) => `"${t.surfaceForm.slice(0, 40)}" ×${t.occurrenceCount}`).join(" · ")}
            </p>
          )}
          {proposed && proposed.length > 0 && (
            <div className="mt-2 rounded-xl border border-glass-line bg-card p-2">
              <p className="mb-1 font-bold text-navy">
                제안된 환자군 — 채택할 것을 고르고, 허가 범위 밖 여부를 확정하세요 (AI 의견은 기본값일 뿐)
              </p>
              {proposed.map((v) => (
                <div key={v.value} className="flex items-start gap-1.5 py-1">
                  <input type="checkbox" checked={picked.has(v.value)}
                         onChange={() => setPicked((prev) => {
                           const n = new Set(prev);
                           if (n.has(v.value)) n.delete(v.value); else n.add(v.value);
                           return n;
                         })} />
                  <span className="flex-1">
                    <code className="font-bold text-navy">{v.value}</code>
                    <span className="ml-1 text-ink">{v.labelKo}</span>
                    <label className="ml-2 cursor-pointer whitespace-nowrap rounded-lg border border-line px-1.5 py-0.5">
                      <input type="checkbox" className="mr-1 align-middle"
                             checked={oolPick.has(v.value)}
                             onChange={() => setOolPick((prev) => {
                               const n = new Set(prev);
                               if (n.has(v.value)) n.delete(v.value); else n.add(v.value);
                               return n;
                             })} />
                      허가 범위 밖
                    </label>
                    <span className="block text-muted">{v.coversKo}</span>
                    {v.outOfLabelReasonKo && (
                      <span className="block text-muted">AI 의견: {v.outOfLabelReasonKo}</span>
                    )}
                    {v.exampleQuote && (
                      <span className="block italic text-muted">예: &ldquo;{v.exampleQuote.slice(0, 90)}&rdquo;</span>
                    )}
                  </span>
                </div>
              ))}
              <Btn size="xs" variant="primary"  onClick={adopt} disabled={!!busy || picked.size === 0}
                      className={`mt-1`}>
                {busy === "adopt" ? "올리는 중…" : `${picked.size}건 스키마 변경 심사에 올리기`}
              </Btn>
            </div>
          )}
        </div>
      )}
    </details>
  );
}
