"use client";

/**
 * 가설 컨펌 ① — 사람이 "이 신호들이 이 가설을 받친다"고 인정하는 자리 (08/29).
 *
 * 파이프라인에서 사람이 판단하는 걸음은 셋이고(① 인정 ② 심의로 올림 ③ 결정),
 * ②③은 이미 있었는데 ①만 없었다. 지금 막혀 있는 카드들이 기다리는 것이 이 걸음이다.
 *
 * **화면은 숫자를 세지 않는다** (절대 규칙 #1). 체크가 바뀌면 `?select=` 로 서버에 다시
 * 물어 "이걸 승인하면 관문이 열리나"를 받아온다. 관문을 판정하는 그 SQL 을 그대로 쓰므로
 * 미리보기가 관문보다 관대해질 수 없다.
 *
 * **기본 체크도 서버가 정한다** — 무엇을 켜 둘지는 검토 정책이지 화면 취향이 아니다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Btn, Chip, Panel } from "@/app/components/ui";

type Excerpt = { text: string; quoteStart: number; quoteEnd: number; truncated: boolean };
type GradeMeta = {
  defaultChecked: boolean; gradeReasonKo: string;
  failedChecks: string[]; scpCandidate: boolean;
};
type Row = {
  claimId: string; status: string; signalType: string;
  summaryKo: string; verbatimQuote: string; reviewGrade: string;
  hcpRef: string | null; region: string | null; occurredOn: string | null;
  quoteMatch: { ok: boolean; reason: string | null; methodKo: string };
  grade: GradeMeta;
  excerpt: Excerpt | null;
};
type GateSide = {
  approved: number; distinctHcp: number; distinctRegions: number; reasonKo: string | null;
};
type Basis = {
  hypothesisId: string; status: string; segment: string;
  basis: Row[]; related: Row[]; alreadyApproved: Row[];
  gate: { now: GateSide; ifSelected: GateSide;
          requires: { approved: number; distinctHcp: number; distinctRegions: number };
          noteKo: string };
  confirmedBy: string | null; confirmedAt: string | null;
};
type ConfirmOut = {
  approved: string[]; alreadyApproved: string[];
  refused: { claimId: string; code: string; reasonKo: string }[];
  transition: { applied: boolean; toStatus: string | null; reasonKo: string | null };
  gate: Basis["gate"]; noteKo: string;
};

/** 인용을 원문 발췌 안에서 형광펜으로 — `review` 화면의 `.evidence` 규칙을 그대로 쓴다. */
function Highlighted({ ex }: { ex: Excerpt }) {
  return (
    <p className="mono whitespace-pre-wrap text-[0.8125rem] leading-[1.75] text-body">
      {ex.truncated && <span className="text-faint">… </span>}
      {ex.text.slice(0, ex.quoteStart)}
      <mark className="evidence">{ex.text.slice(ex.quoteStart, ex.quoteEnd)}</mark>
      {ex.text.slice(ex.quoteEnd)}
      {ex.truncated && <span className="text-faint"> …</span>}
    </p>
  );
}

/** 관문 세 칸 — 지금 / 고른 것 반영 시. 숫자는 전부 서버가 센 것이다. */
function GateBar({ now, next, req }: { now: GateSide; next: GateSide; req: Basis["gate"]["requires"] }) {
  const cells: [string, number, number, number][] = [
    ["승인된 근거", now.approved, next.approved, req.approved],
    ["독립 의료진", now.distinctHcp, next.distinctHcp, req.distinctHcp],
    ["권역", now.distinctRegions, next.distinctRegions, req.distinctRegions],
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cells.map(([label, a, b, need]) => {
        const met = b >= need;
        const moved = b !== a;
        return (
          <div key={label}
               className={`rounded-lg border px-2.5 py-2 ${
                 met ? "border-[color:var(--ok,#2F7E6D)]/40 bg-[color:var(--ok,#2F7E6D)]/[.08]"
                     : "border-line bg-card"}`}>
            <div className="text-[0.75rem] text-muted">{label}</div>
            <div className="mono mt-1 flex items-baseline gap-1 text-[1rem] font-bold tabular-nums">
              <span className={met ? "text-[color:var(--ok,#2F7E6D)]" : "text-orange-deep"}>{b}</span>
              <span className="text-[0.75rem] font-normal text-faint">/ {need}</span>
              {moved && <span className="text-[0.6875rem] font-normal text-faint">({a}에서)</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClaimRow({ r, checked, onToggle }: {
  r: Row; checked: boolean; onToggle: (id: string) => void;
}) {
  const blocked = !r.quoteMatch.ok;
  return (
    <label className={`block rounded-xl border px-3 py-2.5 ${
      blocked ? "border-line bg-fill-1 opacity-70"
              : checked ? "border-orange/45 bg-orange-soft" : "border-line bg-card"}`}>
      <div className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-1" checked={checked} disabled={blocked}
               onChange={() => onToggle(r.claimId)} />
        <div className="min-w-0 flex-1">
          <div className="mono flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-faint">
            <span>{r.claimId}</span>
            <span>· {r.signalType}</span>
            {r.hcpRef && <span>· {r.hcpRef}</span>}
            {r.region && <span>· {r.region}</span>}
            {r.occurredOn && <span>· {r.occurredOn}</span>}
          </div>
          <p className="mt-1 text-[0.875rem] leading-[1.6] text-navy">{r.summaryKo}</p>
          {r.excerpt
            ? <div className="mt-2 rounded-lg border border-glass-line bg-card-solid px-3 py-2">
                <Highlighted ex={r.excerpt} />
              </div>
            : <p className="mt-1.5 text-[0.8125rem] text-faint">원문 발췌를 만들 수 없습니다.</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {blocked
              ? <Chip tone="orange">원문 불일치 — 승인 불가</Chip>
              : !r.grade.defaultChecked && <Chip>{r.grade.gradeReasonKo}</Chip>}
            {r.grade.scpCandidate && <Chip>용어 미매핑 · SCP 후보</Chip>}
          </div>
        </div>
      </div>
    </label>
  );
}

export default function ConfirmPanel({ hypId, status }: { hypId: string; status: string }) {
  const router = useRouter();
  const [data, setData] = useState<Basis | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<ConfirmOut | null>(null);
  const seeded = useRef(false);

  const load = useCallback(async (sel?: string[]) => {
    const q = sel?.length ? `?select=${sel.map(encodeURIComponent).join(",")}` : "";
    const d = await api<Basis>(`/hypotheses/${hypId}/confirm-basis${q}`);
    setData(d);
    // 기본 체크는 **서버가 정한다** — 정책이 화면에 흩어지지 않게 (첫 적재 때만)
    if (!seeded.current) {
      seeded.current = true;
      setPicked(new Set(d.basis.filter((r) => r.grade.defaultChecked && r.quoteMatch.ok)
                                .map((r) => r.claimId)));
    }
    return d;
  }, [hypId]);

  useEffect(() => {
    if (!open || data) return;
    load().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [open, data, load]);

  // 체크가 바뀌면 서버에 다시 묻는다 — 화면이 세지 않는다 (절대 규칙 #1).
  // 토글마다 왕복하지 않도록 250ms 모아 보낸다.
  const sel = useMemo(() => [...picked].sort(), [picked]);
  useEffect(() => {
    if (!open || !seeded.current) return;
    const t = setTimeout(() => {
      load(sel).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [sel, open, load]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      const out = await api<ConfirmOut>(`/hypotheses/${hypId}/confirm`, {
        method: "POST", body: JSON.stringify({ claimIds: sel }),
      });
      setDone(out);
      // **여기서 refresh 하지 않는다.** 상태가 바뀌면 부모의 렌더 조건이 거짓이 되어
      // 이 패널이 통째로 사라진다 — 방금 만든 결과(특히 원문과 안 맞아 **승인하지 않은**
      // 목록, 절대 규칙 #2)를 사람이 읽기도 전에. 아래 [확인]에서 새로고침한다.
      // 좌측 배지는 별도 컴포넌트의 상태다 — 전이한 쪽이 알려 줘야 숫자가 따라온다
      window.dispatchEvent(new CustomEvent("delphi:pipeline-changed"));
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Panel tone="note" pad="md" className="mt-3">
        <p className="text-[0.9375rem] font-medium text-navy">
          신호 {done.approved.length}건을 공식으로 인정했습니다.
          {done.alreadyApproved.length > 0 && ` (이미 승인 ${done.alreadyApproved.length}건)`}
        </p>
        <div className="mt-2.5">
          <GateBar now={done.gate.now} next={done.gate.now} req={done.gate.requires} />
        </div>
        <p className="mt-2.5 text-[0.875rem] leading-[1.7] text-body">
          {/* **어디로 갔는지를 서버가 말한 대로 쓴다.** 전에는 갈래를 하나로 가정해,
              컨펌으로 곧장 열린 BOARD_READY 에도 "이제 검증 대상입니다"라고 정반대를
              가리켰다 — 이 PR 이 열어 준 다음 걸음이 [AI Board로 보내기]인데도. */}
          {done.transition.applied
            ? `${done.transition.reasonKo} — ${
                done.transition.toStatus === "BOARD_READY"
                  ? "이제 [AI Board로 보내기]로 심의에 올릴 수 있습니다."
                  : "이제 다중 에이전트 검증 대상입니다."}`
            : "이 가설은 아직 단계를 넘기지 않습니다 — 관문이 더 남았습니다. " +
              "위 사유를 보세요."}
        </p>
        {done.refused.length > 0 && (
          <p className="mt-2 text-[0.8125rem] leading-[1.6] text-faint">
            승인하지 않은 것 {done.refused.length}건 — {done.refused[0].reasonKo}
          </p>
        )}
        <p className="mono mt-2 text-[0.75rem] text-faint">{done.noteKo}</p>
        {/* 카드를 갱신하는 것은 **사람이 결과를 다 읽은 뒤**다 — 갱신 순간 이 패널은
            부모의 조건에서 빠져 사라진다. 그래서 갱신을 이 버튼까지 미룬다. */}
        <div className="mt-3">
          <Btn size="sm" onClick={() => router.refresh()}>확인 — 카드 갱신</Btn>
        </div>
      </Panel>
    );
  }

  // 옆의 [근거 보기]와 같은 패턴 — **열 때만** 불러온다. 카드마다 미리 부르면 가설 수만큼
  // 원문을 읽어 오프셋을 맞춰 보게 되어(후보 × 문서 전문) 목록 진입이 무거워진다.
  return (
    <div className="mt-3">
      <Btn size="sm" onClick={() => setOpen((v) => !v)}>
        {open ? "컨펌 접기" : "이 가설 컨펌 — 근거를 원문과 대조"}
      </Btn>

      {open && (
        <div className="mt-3">
        {err && <p className="text-[0.875rem] text-rust">{err}</p>}
        {!data && !err && <p className="text-[0.875rem] text-muted">불러오는 중…</p>}

        {data && (
          <div className="mt-3 flex flex-col gap-3">
            <GateBar now={data.gate.now} next={data.gate.ifSelected} req={data.gate.requires} />
            <p className="mono text-[0.75rem] leading-[1.6] text-faint">{data.gate.noteKo}</p>

            {data.alreadyApproved.length > 0 && (
              <p className="text-[0.8125rem] text-muted">
                이미 공식 {data.alreadyApproved.length}건 — 아래 목록에는 없습니다.
              </p>
            )}

            <div className="flex flex-col gap-2">
              {data.basis.map((r) => (
                <ClaimRow key={r.claimId} r={r} checked={picked.has(r.claimId)} onToggle={toggle} />
              ))}
              {data.basis.length === 0 && (
                <p className="text-[0.875rem] text-muted">
                  이 가설의 신호에 남은 미승인 근거가 없습니다.
                </p>
              )}
            </div>

            {data.related.length > 0 && (
              <details className="rounded-xl border border-line bg-card px-3 py-2">
                <summary className="cursor-pointer text-[0.8125rem] text-muted">
                  같은 환자군의 다른 신호 {data.related.length}건 — 이 가설이 정박한 신호는 아닙니다
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  {data.related.slice(0, 8).map((r) => (
                    <ClaimRow key={r.claimId} r={r} checked={picked.has(r.claimId)} onToggle={toggle} />
                  ))}
                </div>
              </details>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Btn variant="primary" size="sm" onClick={confirm} disabled={busy || sel.length === 0}>
                {busy ? "인정하는 중…" : `고른 ${sel.length}건 컨펌`}
              </Btn>
              {/* 규칙 번호(절대 규칙 #3)는 화면에서 뺀다 (08/31 용어 정리) — 내용만. */}
              <span className="text-[0.8125rem] text-faint">
                컨펌하면 이 신호들이 공식 집계에 들어갑니다.
              </span>
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
}
