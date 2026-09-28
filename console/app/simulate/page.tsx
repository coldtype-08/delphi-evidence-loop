"use client";

/**
 * 재현 시뮬레이션 (AUDIT) — 08/30 신설.
 *
 * 실DB **사본**에서 Sense→Screen→Board를 회차마다 처음부터 다시 돌리고, 회차 간
 * 결과가 같은지를 대조한다. 리셋과 반대 방향의 도구다: 리셋은 다시 돌리기 위해
 * 쌓인 것을 지우지만, 여기는 **지우지 않기 위해** 사본을 뜬다 — 면담·계약·사전은
 * 사본 안에서도 삭제 목록 밖이고, 회차 전후 지문(sha)이 리포트에 남는다.
 *
 * 사람의 판단은 다시 내리지 않는다: 승인·기각은 원문 위치로 같은 자리에 **재생**되고,
 * Board는 권고까지만 돌며 의장 판정은 내리지 않는다 (Agent에 승인 권한 없음).
 *
 * 아래 로그·숫자는 화면이 만들지 않는다 — 워커가 남긴 이벤트와 서버 SQL 집계를
 * 그대로 흘린다 (`/system/simulate`, docs/04 §8). 폴링 계약은 연속 처리 러너와 동일.
 */

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { hhmmss } from "../pipeline/_lib/format";
import { Btn, Chip, Eyebrow, FIELD, Fold, Panel, TableFrame, TD, TH, Topbar } from "@/app/components/ui";

type SimEvent = { seq: number; ts: string; kind: string; round: number | null; messageKo: string };
type RoundHyp = { id: string; segment: string; signalIds: string[]; status: string; reason: string | null; title: string };
type Round = {
  round: number; durationMs?: number; protectedIntact?: boolean; abortedKo?: string;
  sense?: { docs: number; claims: number; safety: number; errors: number; cacheMissSkipped: number };
  reviewReplay?: { claimsReplayed: number; claimsUnmatched: number; axisChanged: number };
  board?: { hypothesisId: string; recommended: string | null }[];
  metrics?: {
    claims: { total: number; byStatus: Record<string, number> };
    hypotheses: RoundHyp[];
    llm: { byMode: Record<string, { calls: number; costUsd: number }>; spentUsd: number };
  };
};
type Report = {
  rounds: Round[]; protectedIntact: boolean | null; sandbox: string;
  reproducibility: { comparedRounds: number; identical: boolean; diffsKo: string[]; noteKo: string };
};
type SimState = {
  runId: string | null; running: boolean; startedAt: string | null; finishedAt: string | null;
  params: Record<string, number | string>; sandbox: string | null;
  events: SimEvent[]; lastSeq: number; report: Report | null; error: string | null;
};

/* 워커 이벤트 종류 — runner 의 EVENT_TAG 와 같은 방식, 종류만 이 화면의 것 */
const TAG: Record<string, { label: string; cls: string }> = {
  RUN:    { label: "RUN",  cls: "bg-fill-2 text-body" },
  WIPE:   { label: "비움", cls: "bg-fill-2 text-muted" },
  SENSE:  { label: "판독", cls: "bg-navy/10 text-navy" },
  REPLAY: { label: "재생", cls: "bg-green-soft text-green" },
  HYP:    { label: "가설", cls: "bg-orange-soft text-orange-deep" },
  SCREEN: { label: "검증", cls: "bg-navy/10 text-navy" },
  BOARD:  { label: "심의", cls: "bg-navy/10 text-navy" },
  ROUND:  { label: "회차", cls: "bg-green-soft text-green" },
};

const usd = (n: number) => `$${n.toFixed(2)}`;

export default function SimulatePage() {
  const [rounds, setRounds] = useState(3);
  // Screen은 관문 판정 **전에** 외부 4출처를 다 돌리므로(orchestrator 구조) 켜면 가설당
  // 실비가 들 수 있다 — 기본은 생략(0). 전체는 null(미지정)로 보낸다 (docs/04 §8).
  const [screenLimit, setScreenLimit] = useState<number | null>(0);
  const [boardLimit, setBoardLimit] = useState(0);
  const [llmMode, setLlmMode] = useState<"cache-only" | "cache-first">("cache-only");

  const [state, setState] = useState<SimState | null>(null);
  const [log, setLog] = useState<SimEvent[]>([]);
  const [polling, setPolling] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lastSeq = useRef(0);
  const logBox = useRef<HTMLDivElement>(null);

  // 첫 진입: 지난 실행이 있으면 그대로 잇는다 — 새로고침해도 서버 잡에 다시 붙는다 (러너 선례)
  useEffect(() => {
    api<SimState>("/system/simulate?after=0").then((s) => {
      setState(s); setLog(s.events); lastSeq.current = s.lastSeq;
      if (s.running) setPolling(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await api<SimState>(`/system/simulate?after=${lastSeq.current}`);
        if (cancelled) return;
        if (s.events.length) {
          lastSeq.current = s.lastSeq;
          setLog((prev) => [...prev, ...s.events].slice(-800));
        }
        setState(s);
        if (!s.running) setPolling(false);
      } catch { /* 일시 오류는 다음 틱에 재시도 */ }
    };
    tick();
    const t = setInterval(tick, 1200);
    return () => { cancelled = true; clearInterval(t); };
  }, [polling]);

  useEffect(() => { logBox.current?.scrollTo({ top: logBox.current.scrollHeight }); }, [log]);

  const start = async () => {
    setErr(null);
    try {
      const body: Record<string, number | string> = { rounds, boardLimit, llmMode };
      if (screenLimit !== null) body.screenLimit = screenLimit;   // 미지정 = 가설 전부
      await api("/system/simulate", { method: "POST", body: JSON.stringify(body) });
      lastSeq.current = 0; setLog([]);
      setPolling(true);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    }
  };
  const stop = () => { api("/system/simulate/stop", { method: "POST" }).catch(() => {}); };

  const report = state?.report ?? null;
  const done = report?.rounds.filter((r) => r.metrics) ?? [];
  // 표시용 판별 — 수치 자체는 전부 서버 리포트의 값이다
  const allCache = done.length > 0 && done.every((r) =>
    Object.keys(r.metrics!.llm.byMode).every((m) => m === "CACHE"));

  return (
    <>
      <Topbar
        title="재현 시뮬레이션"
        meta={state?.runId ? `${state.runId}${state.sandbox ? ` · 사본 ${state.sandbox.split("/").pop()}` : ""}` : undefined}
        right={state?.running
          ? <Btn size="sm" onClick={stop} className="!border-rust/40 !text-rust">중지</Btn>
          : <Btn variant="primary" size="sm" onClick={start}>시뮬레이션 시작</Btn>}
      />

      <div className="mx-auto max-w-5xl">
        <Eyebrow>AUDIT · 증빙</Eyebrow>
        <h1 className="mt-2 text-[1.5rem] font-bold leading-[1.25] tracking-tight text-navy">
          같은 데이터로 다시 돌려도 같은 답이 나오는가
        </h1>
        <p className="mt-1.5 max-w-[72ch] text-[0.875rem] leading-[1.7] text-body">
          실DB의 <b className="text-ink">사본</b>에서 Sense→Screen→Board를 회차마다 처음부터 다시 돌리고
          회차 간 결과를 대조합니다. <b className="text-ink">면담 데이터·계약·사전은 건드리지 않습니다</b> —
          워커는 사본 파일에만 붙고, 사본 안에서도 원재료는 회차 전후 지문(sha)으로 불변을 증명합니다.
          승인·기각은 원문 위치로 <b className="text-ink">재생</b>되고, Board는 권고까지만 돕니다(판정은 사람 몫).
        </p>

        {/* ── 실행 조건 ─────────────────────────────────────────────── */}
        <Panel pad="md" className="mt-5">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <label className="flex flex-col gap-1.5 text-[0.6875rem] text-muted">
              반복 회차
              <select className={FIELD} value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
                <option value={2}>2회 — 최소 대조</option>
                <option value={3}>3회 (기본)</option>
                <option value={5}>5회</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[0.6875rem] text-muted">
              Screen 교차검증
              <select className={FIELD} value={screenLimit === null ? "all" : screenLimit}
                      onChange={(e) => setScreenLimit(e.target.value === "all" ? null : Number(e.target.value))}>
                <option value={0}>생략 (기본)</option>
                <option value={1}>상위 가설 1건</option>
                <option value={3}>상위 가설 3건</option>
                <option value="all">가설 전부</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[0.6875rem] text-muted">
              Board 심의
              <select className={FIELD} value={boardLimit} onChange={(e) => setBoardLimit(Number(e.target.value))}>
                <option value={0}>없음 (기본)</option>
                <option value={1}>BOARD_READY 1건</option>
                <option value={3}>BOARD_READY 3건</option>
              </select>
            </label>
            <div className="flex flex-col gap-1.5 text-[0.6875rem] text-muted">
              LLM 비용
              <div className="flex flex-col gap-1 text-[0.8125rem] leading-[1.6] text-muted">
                <label className="inline-flex items-start gap-2">
                  <input type="radio" className="mt-1" checked={llmMode === "cache-only"} onChange={() => setLlmMode("cache-only")} />
                  <span><b className="font-medium text-navy">캐시만</b> — 미적중은 건너뜀 · <b className="text-green">0원 보장</b></span>
                </label>
                <label className="inline-flex items-start gap-2">
                  <input type="radio" className="mt-1" checked={llmMode === "cache-first"} onChange={() => setLlmMode("cache-first")} />
                  <span><b className="font-medium text-orange-deep">캐시 우선</b> — 미적중만 실호출 (비용 발생 가능)</span>
                </label>
              </div>
            </div>
          </div>
          <p className="mono mt-3 text-[0.6875rem] leading-[1.7] text-muted">
            판독(Sense)은 항상 대기 문서 전부를 돕니다. Screen·Board를 켜면 미적중 시 가설당 실비가
            들 수 있습니다 — 같은 날 2회차부터는 1회차 캐시를 재생하므로 0원입니다.
          </p>
        </Panel>

        {err && (
          <Panel tone="note" pad="sm" className="mono mt-4 text-[0.75rem] leading-[1.7] text-rust">{err}</Panel>
        )}
        {state?.error && !state.running && (
          <Panel tone="note" pad="sm" className="mono mt-4 whitespace-pre-wrap text-[0.75rem] leading-[1.7] text-rust">
            {state.error}
          </Panel>
        )}

        {/* ── 진행 상태 + 로그 ──────────────────────────────────────── */}
        {(state?.running || log.length > 0) && (
          <div className="mono mt-5 flex flex-wrap items-center gap-2 text-[0.75rem]">
            <Chip tone={state?.running ? "orange" : "plain"}>{state?.running ? "실행 중" : "종료"}</Chip>
            {state?.runId && <code className="text-faint">{state.runId}</code>}
            {typeof state?.params?.rounds === "number" && (
              <span className="text-muted">
                {String(state.params.rounds)}회 · Screen {String(state.params.screenLimit ?? "—")} ·
                Board {String(state.params.boardLimit ?? "—")} · {String(state.params.llmMode ?? "")}
              </span>
            )}
          </div>
        )}

        <div ref={logBox}
             className="mono mt-3.5 max-h-80 overflow-auto rounded-lg border border-glass-line bg-card px-3.5 py-3 text-[0.75rem] leading-[1.85]">
          {log.length === 0 ? (
            <p className="font-sans text-[0.875rem] text-muted">
              아직 실행 기록이 없습니다. 시작하면 사본 생성 → 산출물 비움 → 판독 → 판단 재생 →
              가설 → (Screen·Board) 순서가 회차마다 흐릅니다.
            </p>
          ) : (
            log.map((e) => {
              const tag = TAG[e.kind] ?? { label: e.kind, cls: "bg-fill-2 text-body" };
              return (
                <div key={e.seq} className="flex items-start gap-2.5 py-px">
                  <span className="shrink-0 text-faint">{hhmmss(e.ts)}</span>
                  <span className={`mt-1 w-9 shrink-0 rounded px-1 text-center text-[0.6875rem] font-medium leading-[1.5] ${tag.cls}`}>{tag.label}</span>
                  <span className="text-ink">{e.messageKo}</span>
                </div>
              );
            })
          )}
        </div>

        {/* ── 결과 리포트 ───────────────────────────────────────────── */}
        {report && done.length > 0 && (
          <section className="mt-6">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={report.reproducibility.identical ? "green" : "rust"}>
                {report.reproducibility.identical
                  ? `재현 일치 — ${report.reproducibility.comparedRounds}회차 결과 동일`
                  : `회차 간 차이 ${report.reproducibility.diffsKo.length}건`}
              </Chip>
              <Chip tone={report.protectedIntact ? "green" : "rust"}>
                {report.protectedIntact ? "원재료 불변 ✓ (면담·계약·사전)" : "원재료 지문 변동 — 리포트 확인"}
              </Chip>
              {allCache && <Chip tone="plain">LLM 전부 캐시 재생 (0원)</Chip>}
            </div>
            <p className="mt-2 max-w-[72ch] text-[0.8125rem] leading-[1.7] text-body">{report.reproducibility.noteKo}</p>
            {!report.reproducibility.identical && report.reproducibility.diffsKo.length > 0 && (
              <ul className="mono mt-2 list-disc pl-5 text-[0.75rem] leading-[1.8] text-rust">
                {report.reproducibility.diffsKo.map((d) => <li key={d}>{d}</li>)}
              </ul>
            )}

            {/* TableFrame이 <table>까지 그린다 — 안에는 thead/tbody만 (하위 표 중첩 금지) */}
            <TableFrame className="mt-4">
              <thead>
                <tr>
                  <th className={TH}>회차</th><th className={TH}>claim</th><th className={TH}>승인 재생</th>
                  <th className={TH}>가설</th><th className={TH}>Board 권고</th>
                  <th className={TH}>LLM (캐시/실호출)</th><th className={TH}>지출</th><th className={TH}>소요</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {done.map((r) => {
                  const m = r.metrics!;
                  const cache = m.llm.byMode.CACHE?.calls ?? 0;
                  const real = (m.llm.byMode.REALTIME?.calls ?? 0) + (m.llm.byMode.BATCH?.calls ?? 0);
                  return (
                    <tr key={r.round}>
                      <td className={`${TD} font-medium text-ink`}>{r.round}회차</td>
                      <td className={TD}>{m.claims.total.toLocaleString()}
                        {(m.claims.byStatus.APPROVED ?? 0) > 0 && <span className="text-green"> · 승인 {m.claims.byStatus.APPROVED}</span>}
                      </td>
                      <td className={TD}>{r.reviewReplay ? `${r.reviewReplay.claimsReplayed}건${r.reviewReplay.claimsUnmatched ? ` (못 찾음 ${r.reviewReplay.claimsUnmatched})` : ""}` : "—"}</td>
                      <td className={TD}>{m.hypotheses.length}</td>
                      <td className={TD}>{r.board && r.board.length > 0
                        ? r.board.map((b) => `${b.hypothesisId}: ${b.recommended ?? "—"}`).join(" · ")
                        : "생략"}</td>
                      <td className={TD}>{cache.toLocaleString()}{real > 0 && <b className="text-orange-deep"> / 실호출 {real}</b>}</td>
                      <td className={TD}>{usd(m.llm.spentUsd)}</td>
                      <td className={TD}>{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableFrame>

            {done[0]?.metrics && done[0].metrics.hypotheses.length > 0 && (
              <Panel tone="inset" pad="sm" className="mt-3.5">
                <Eyebrow>회차가 도출한 가설 (1회차 기준 — 재현 일치면 전 회차 동일)</Eyebrow>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {done[0].metrics.hypotheses.map((h) => (
                    <li key={h.id} className="text-[0.8125rem] leading-[1.6] text-body">
                      <code className="mono mr-1.5 text-[0.75rem] text-faint">{h.id}</code>
                      {h.title}
                      <span className="mono ml-1.5 text-[0.6875rem] text-muted">
                        {h.status}{h.reason ? ` · ${h.reason}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {/* Fold 는 title 을 받는다 (className 은 안 받는다) — 08/27 #77 에서
                summary→title 로 바뀌었다. 여백은 감싸는 div 가 준다. */}
            <div className="mt-3.5">
              <Fold tone="quiet" title="사본이 어디에 있고 무엇이 보존됐나">
                <p className="mono text-[0.75rem] leading-[1.8] text-muted">
                  사본: <code>{report.sandbox}</code><br />
                  리포트 파일: <code>backend/data/sim/{state?.runId}.report.json</code> —
                  회차별 지표·원재료 지문(sha) 전문이 남습니다. 사본은 최근 3회분만 보관합니다.
                </p>
              </Fold>
            </div>
          </section>
        )}

        <p className="mono mt-6 text-[0.6875rem] leading-[1.7] text-muted">
          수치는 전부 서버가 센 것입니다 (사본 DB의 SQL 집계). 이 화면은 워커
          프로세스(<code>app/sim_worker.py</code>)의 이벤트와 리포트를 그대로 보여줍니다.
        </p>
      </div>
    </>
  );
}
