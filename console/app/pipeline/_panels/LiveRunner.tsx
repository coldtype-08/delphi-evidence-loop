"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Agent, RunEvent, RunState, BatchState } from "../_lib/types";
import { EVENT_TAG } from "../_lib/const";
import { hhmmss } from "../_lib/format";
import { Panel, Step, Eyebrow, Chip, Btn } from "@/app/components/ui";
import CostBadges from "./CostBadges";

export default function LiveRunner({ ready, blocked, blockedReason, contractVersion, spec, contractActive,
                     onTick, onFinished }: {
  ready: boolean; blocked: boolean; blockedReason?: string; contractVersion?: string | null;
  spec?: Agent; contractActive: boolean;
  onTick: () => void; onFinished: () => void;
}) {
  // 처리 방식 (08/26 통합): 지금 바로 = 한 건씩 즉시(정가) · 한꺼번에 맡기기 = 배치(반값, 대기).
  // 배치는 결과를 캐시에 채우고, 적재·검증은 같은 경로가 한다 — 검증이 갈라지지 않는다.
  const [mode, setMode] = useState<"realtime" | "batch">("realtime");
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [batchPolling, setBatchPolling] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const batchSeq = useRef(0);

  useEffect(() => {
    api<BatchState>("/system/batch-fill?after=0").then((b) => {
      if (!b.target && !b.pending) return;
      setBatch(b); batchSeq.current = b.lastSeq;
      if (b.running) { setMode("batch"); setBatchPolling(true); }
      else if (b.pending) setMode("batch");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!batchPolling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const b = await api<BatchState>(`/system/batch-fill?after=${batchSeq.current}`);
        if (cancelled) return;
        if (b.events.length) batchSeq.current = b.lastSeq;
        setBatch((prev) => ({ ...b, events: [...(prev?.events ?? []), ...b.events].slice(-200) }));
        if (!b.running) setBatchPolling(false);
      } catch { /* 다음 틱에 재시도 */ }
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [batchPolling]);
  const [limit, setLimit] = useState(0);   // 0 = 전체 (기본, 08/25) — 부분은 시험용
  const [run, setRun] = useState<RunState | null>(null);
  const [log, setLog] = useState<RunEvent[]>([]);
  const [polling, setPolling] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  const lastSeq = useRef(0);
  const logBox = useRef<HTMLDivElement>(null);

  /** 마운트 시 서버 상태를 한 번 읽는다 (08/30).
   *
   * 그 전에는 이 카드가 **`[시작]`을 누른 뒤에만** 서버를 봤다. 그래서 화면을 새로고침하면
   * 방금 끝난 판독의 로그가 통째로 사라졌고, 서버를 다시 띄운 뒤에는 코퍼스 470건이 이미
   * 구조화돼 있는데도 "아직 로그가 없습니다"만 떴다 — 이 카드는 「라인이 실제로 돈다」를
   * 증명하는 자리인데 증거만 휘발한 셈이다. 바로 위 배치 패널은 같은 자리에서 이미 이렇게
   * 하고 있었는데(`/system/batch-fill?after=0`) 실시간 쪽만 빠져 있었다.
   *
   * 서버는 메모리 로그가 비었으면 **DB에 남은 행에서 지난 판독을 복원**해서 준다
   * (`replay: true`). 진행 중이었다면 폴링을 이어 붙인다 — 새로고침이 실행을 끊지 않는다.
   */
  useEffect(() => {
    let alive = true;
    api<RunState>("/system/extract-run?after=0").then((s) => {
      if (!alive || !s.events.length) return;
      lastSeq.current = s.lastSeq;
      setLog(s.events);
      setRun(s);
      if (s.running) setPolling(true);
    }).catch(() => { /* 로그가 없어도 카드는 그대로 뜬다 */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await api<RunState>(`/system/extract-run?after=${lastSeq.current}`);
        if (cancelled) return;
        if (s.events.length) {
          lastSeq.current = s.lastSeq;
          setLog((prev) => [...prev, ...s.events].slice(-800));
        }
        setRun(s);
        onTick();
        if (!s.running) { setPolling(false); onFinished(); }
      } catch { /* 일시 오류는 다음 틱에 재시도 */ }
    };
    tick();
    const t = setInterval(tick, 1200);
    return () => { cancelled = true; clearInterval(t); };
  }, [polling, onTick, onFinished]);

  useEffect(() => {
    logBox.current?.scrollTo({ top: logBox.current.scrollHeight });
  }, [log]);

  const startBatch = async () => {
    setBatchBusy(true); setRunErr(null);
    try {
      const b = await api<BatchState>("/system/batch-fill",
        { method: "POST", body: JSON.stringify({ target: "extract" }) });
      setBatch(b); batchSeq.current = b.lastSeq;
      if (b.running) setBatchPolling(true);
    } catch (e) {
      setRunErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBatchBusy(false); }
  };
  const stopBatch = async () => {
    setBatchBusy(true);
    try { await api("/system/batch-fill/stop", { method: "POST" }); }
    catch { /* 상태는 폴링이 갱신한다 */ }
    finally { setBatchBusy(false); }
  };
  const resumeBatch = async () => {
    setBatchBusy(true); setRunErr(null);
    try {
      const b = await api<BatchState>("/system/batch-fill/resume", { method: "POST" });
      setBatch(b); setBatchPolling(true);
    } catch (e) {
      setRunErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBatchBusy(false); }
  };

  const start = async () => {
    setRunErr(null);
    try {
      const out = await api<{ started: boolean; messageKo?: string; totalDocs?: number }>(
        "/system/extract-run", { method: "POST", body: JSON.stringify({ limit }) });
      if (!out.started) { setRunErr(out.messageKo ?? "시작할 문서가 없습니다."); return; }
      lastSeq.current = 0;
      setLog([]);
      setPolling(true);
    } catch (e) {
      setRunErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    }
  };
  const stop = () => { api("/system/extract-run/stop", { method: "POST" }).catch(() => {}); };

  const pct = run && run.totalDocs > 0 ? Math.round((run.processed / run.totalDocs) * 100) : 0;

  return (
    <Panel as="section" pad="lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Step n="2" />
            <h2 className="text-[1.0625rem] font-bold leading-tight text-navy">
              구조화 — 확정 스키마로 값과 근거를 추출
            </h2>
          </div>
          {/* 한 줄만 남기고 접는다 (08/26 — 건태). 막고 있는 이유는 접지 않는다:
              그건 설명이 아니라 지금 눌러야 할 것을 말해 주는 상태다. */}
          <p className="mt-3 max-w-[70ch] text-[0.875rem] leading-[1.75] text-body">
            확정된 스키마{contractVersion ? <> (<b className="text-ink">Contract v{contractVersion}</b>)</> : ""}에 맞춰{" "}
            <b className="text-ink">AI 에이전트가 추출 대기 문서를 읽고</b>, 근거 문장이 원문과
            일치하는 값만 저장합니다.
            {blocked && <b className="font-medium text-rust"> {blockedReason ?? "먼저 0단계에서 원본을 나눠 주세요."}</b>}
          </p>
          <details className="group mt-1.5">
            <summary className="mono inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg text-[0.75rem] text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange">
              <span aria-hidden>▶</span>{/* 회전은 globals.css 전역 규칙이 한다 */}
              로그 출처와 비용
            </summary>
            <p className="mt-2 max-w-[70ch] text-[0.875rem] leading-[1.7] text-body">
              아래 로그는 연출이 아니라 서버 기록
              (<code>llm_runs</code>·<code>claims</code>·<code>blocked_log</code>)에서 그대로 나온 것입니다.
              {!ready && " 지금은 키가 없어 이미 처리된 문서만 재생됩니다."}
            </p>
            <CostBadges spec={spec} alwaysOpen />
          </details>
          <Panel tone="inset" pad="sm" className="mt-3.5">
            <Eyebrow>처리 방식</Eyebrow>
            <div className="mt-2.5 flex flex-col gap-1.5 text-[0.875rem] leading-[1.6] text-muted">
              <label className="inline-flex items-start gap-2">
                <input type="radio" className="mt-1" checked={mode === "realtime"} onChange={() => setMode("realtime")} />
                <span><b className="font-medium text-navy">지금 바로</b> — 한 건씩 즉시 · 정가 · 진행이 실시간으로 보임</span>
              </label>
              <label className="inline-flex items-start gap-2">
                <input type="radio" className="mt-1" checked={mode === "batch"} onChange={() => setMode("batch")} />
                <span><b className="font-medium text-orange-deep">한꺼번에 맡기기</b> — 비용 절반 · 최대 24시간 대기</span>
              </label>
            </div>
          </Panel>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "realtime" ? (
            <>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
                      className="mono rounded-xl border border-line bg-card px-3 py-2 text-[0.875rem] text-navy"
                      aria-label="처리 범위">
                <option value={0}>전체 — 대기 문서 전부</option>
                <option value={20}>20건 (시험)</option>
                <option value={30}>30건</option>
                <option value={120}>120건</option>
              </select>
              {run?.running ? (
                <Btn size="sm" onClick={stop}
                     title="확정된 스키마로 아직 판독하지 않은 문서를 처리합니다. 이미 판독한 문서는 건너뜁니다"
                     className="!border-rust/40 !text-rust">
                  중지
                </Btn>
              ) : (
                <Btn variant="primary" size="sm" onClick={start} disabled={blocked}
                     title="확정된 스키마로 아직 판독하지 않은 문서를 처리합니다. 이미 판독한 문서는 건너뜁니다">
                  {limit === 0 ? "전체 판독 시작" : `${limit}건 처리 시작`}
                </Btn>
              )}
            </>
          ) : batch?.running ? (
            <Btn size="sm" onClick={stopBatch} disabled={batchBusy} className="!border-rust/40 !text-rust">
              {batchBusy ? "중지 요청 중…" : "배치 중지"}
            </Btn>
          ) : batch?.pending ? (
            <Btn size="sm" onClick={resumeBatch} disabled={batchBusy}>
              {batchBusy ? "재연결 중…" : "맡긴 작업 결과 받기"}
            </Btn>
          ) : (
            <Btn variant="primary" size="sm" onClick={startBatch}
                 disabled={blocked || batchBusy || !contractActive}>
              {batchBusy ? "제출 중…" : "한꺼번에 맡기기 (반값)"}
            </Btn>
          )}
        </div>
      </div>

      {/* 맡긴 작업 진행 — 별도 카드가 아니라 여기서 (08/26) */}
      {mode === "batch" && batch && (batch.target || batch.pending) && (
        <Panel tone="inset" pad="sm" className="mt-3.5 text-[0.8125rem]">
          {batch.pending && !batch.running && (
            <p className="mb-2.5 text-[0.875rem] leading-[1.7] text-body">
              <b className="font-medium text-rust">아직 받지 않은 결과가 있습니다</b> — <code className="mono">{batch.pending.batchId}</code>.
              요청은 이미 제출·과금된 상태라 <b className="font-medium text-navy">지금 받아도 추가 비용이 없습니다.</b>
            </p>
          )}
          <div className="mono flex flex-wrap items-center gap-2">
            <Chip tone={batch.running ? "orange" : "plain"}>
              {batch.running ? "맡긴 작업 처리 중" : "종료"}
            </Chip>
            {batch.batchId && <code className="text-faint">{batch.batchId}</code>}
            <span className="ml-auto text-[0.75rem] text-muted">
              {!batch.running && batch.finishedAt && <>적재 {batch.succeeded} · 실패 {batch.errored} · </>}
              맡긴 건수 {batch.total.toLocaleString()} (의료진 발언 블록 수 = AI 호출 횟수)
            </span>
          </div>
          <div className="mono mt-2.5 max-h-32 space-y-0.5 overflow-auto text-[0.75rem] leading-[1.7]">
            {batch.events.slice(-25).map((e) => (
              <div key={e.seq} className="text-faint">
                <span className="mr-2">{hhmmss(e.ts)}</span>
                <span className="text-body">{e.messageKo}</span>
              </div>
            ))}
          </div>
          {!batch.running && batch.succeeded > 0 && (
            <p className="mt-2.5 text-[0.875rem] font-medium text-green">
              결과를 받았습니다 — &ldquo;지금 바로&rdquo;로 바꿔 실행하면 0원으로 적재됩니다.
            </p>
          )}
        </Panel>
      )}

      {runErr && (
        <Panel tone="note" pad="sm" className="mono mt-3.5 text-[0.8125rem] leading-[1.7] text-rust">{runErr}</Panel>
      )}

      {run && (run.running || log.length > 0) && (
        <>
          <div className="mono mt-4 flex flex-wrap items-center gap-2 text-[0.8125rem]">
            <Chip tone={run.running ? "orange" : "plain"}>
              {run.running ? "실행 중" : run.replay ? "지난 기록" : "종료"}
            </Chip>
            <span className="tabular-nums text-navy">
              {run.replay ? `구조화된 문서 ${run.totalDocs.toLocaleString()}건`
                          : `문서 ${run.processed}/${run.totalDocs}`}
            </span>
            {run.currentDocId && <code className="text-faint">{run.currentDocId}</code>}
            <span className="ml-auto text-[0.75rem] text-muted">
              claim +{run.totals.claims} · 거부 {run.totals.rejected} · AE 분리 {run.totals.safety} ·
              LLM {run.totals.llmCalls}회 (캐시 {run.totals.cacheHits})
              {(run.totals.errors ?? 0) > 0 && (
                <b className="ml-1 text-rust">· 오류 건너뜀 {run.totals.errors}</b>
              )}
            </span>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-fill-2">
            <div className="h-full rounded-full bg-orange transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}

      <div ref={logBox}
           className="mono mt-3.5 max-h-80 overflow-auto rounded-lg border border-glass-line bg-card px-3.5 py-3 text-[0.8125rem] leading-[1.85]">
        {log.length === 0 ? (
          <p className="font-sans text-[0.9375rem] text-muted">
            아직 로그가 없습니다 — 이 DB에는 구조화된 claim이 한 건도 없습니다.
            처리를 시작하면 블록 단위 LLM 호출·근거 검증·저장·거부가 실시간으로 흐릅니다.
          </p>
        ) : (
          log.map((e) => {
            const tag = EVENT_TAG[e.kind] ?? { label: e.kind, cls: "bg-fill-2 text-body" };
            return (
              <div key={e.seq} className="flex items-start gap-2.5 py-px">
                {/* 복원분은 **시각이 아니라 면담일**이다 (08/30) — claims 에 적재 시각이
                    남지 않아 서버가 문서 날짜를 준다. hh:mm:ss 로 찍으면 없는 시각을
                    지어내는 셈이라 날짜 그대로 둔다. */}
                <span className="shrink-0 text-faint"
                      title={run?.replay ? "이 문서의 면담일 — 복원분에는 적재 시각이 없습니다" : undefined}>
                  {run?.replay ? e.ts.slice(0, 10) : hhmmss(e.ts)}
                </span>
                <span className={`mt-1 w-9 shrink-0 rounded px-1 text-center text-[0.75rem] font-medium leading-[1.5] ${tag.cls}`}>{tag.label}</span>
                <span className="text-ink">{e.messageKo}</span>
              </div>
            );
          })
        )}
      </div>
      {/* 08/30 개정(#115) — 절대 규칙 #3의 승인 위치가 «본부 검토 큐»에서 «수집 시점»으로
          옮겨졌다. 그 전 문구("생성된 claim은 전부 CANDIDATE입니다 … 잠정 집계")는 이제
          사실이 아니다: 원석 배치분은 적재하는 순간 승인되고(승인자 BATCH_INGEST), 검증에
          걸린 행만 사람에게 남는다. 그래서 「잠정」이라는 말도 여기서 사라진다 — 대기 중인
          숫자가 없다. */}
      <p className="mono mt-3 text-[0.75rem] leading-[1.7] text-muted">
        생성된 claim은 <b className="font-medium text-body">적재 시점에 승인</b>됩니다 —
        원석(과거 축적분)은 승인자를 <code>BATCH_INGEST</code>로 남기고, 현장 수집분은
        그 대화에 있었던 수집자가 앱에서 카드를 승인합니다.{" "}
        <b className="font-medium text-body">검증에 걸린 행(L등급 — 용어 매핑 실패·계약 위반)만</b>{" "}
        사람 몫으로 남고, 거기서 하는 일은 승인이 아니라 <b className="font-medium text-body">틀린 것을 걷어내는 것</b>입니다
        (절대 규칙 #3). 다음 걸음은{" "}
        <a href="/hypotheses" className="font-medium text-orange-deep underline underline-offset-2">신호와 가설</a>에서의
        가설 도출입니다.
      </p>
    </Panel>
  );
}
