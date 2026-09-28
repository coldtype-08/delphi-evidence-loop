"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { BatchState } from "../_lib/types";
import { hhmmss } from "../_lib/format";
import { Btn, Panel } from "@/app/components/ui";

export default function BatchFillPanel({ contractActive }: { contractActive: boolean }) {
  const [st, setSt] = useState<BatchState | null>(null);
  const [log, setLog] = useState<BatchState["events"]>([]);
  const [polling, setPolling] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lastSeq = useRef(0);

  useEffect(() => {
    // 새로고침해도 서버에서 도는 배치에 다시 붙는다 — 서버가 진실이다
    api<BatchState>("/system/batch-fill?after=0").then((s) => {
      if (!s.target) return;
      setSt(s); setLog(s.events); lastSeq.current = s.lastSeq;
      if (s.running) setPolling(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await api<BatchState>(`/system/batch-fill?after=${lastSeq.current}`);
        if (cancelled) return;
        if (s.events.length) {
          lastSeq.current = s.lastSeq;
          setLog((prev) => [...prev, ...s.events].slice(-200));
        }
        setSt(s);
        if (!s.running) setPolling(false);
      } catch { /* 다음 틱에 재시도 */ }
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [polling]);

  const [stopping, setStopping] = useState(false);
  const [resuming, setResuming] = useState(false);
  const resume = async () => {
    setResuming(true); setErr(null);
    try {
      const s = await api<BatchState>("/system/batch-fill/resume", { method: "POST" });
      setSt(s); setPolling(true);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally {
      setResuming(false);
    }
  };
  const stop = async () => {
    setStopping(true);
    try {
      await api("/system/batch-fill/stop", { method: "POST" });
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally {
      setStopping(false);
    }
  };

  const start = async (target: "extract" | "scan") => {
    setErr(null);
    try {
      const s = await api<BatchState>("/system/batch-fill",
        { method: "POST", body: JSON.stringify({ target }) });
      setSt(s); setLog(s.events); lastSeq.current = s.lastSeq;
      if (s.running) setPolling(true);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    }
  };

  return (
    <Panel as="section" pad="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-navy">배치 프리로드 — 대량 처리는 반값으로</h2>
          <p className="mt-1 text-xs text-muted">
            대량 LLM 호출을 <b className="text-ink">배치 API(정가의 50%)</b>로 처리해 응답 캐시를
            채웁니다. 배치는 결과를 직접 적재하지 않습니다 — 캐시만 채우고, 위·아래의
            <b className="text-ink"> 기존 실행 버튼</b>이 캐시 재생(0원)으로 검증·적재합니다.
            검증 경로가 갈라지지 않고, 모든 건이 호출 기록에 <b className="text-ink">배치(반값)</b>로
            남습니다. 운영 구조: <b className="text-ink">대량 적재 = 배치 · 시연 = 캐시 재생 ·
            신규 수집 1건 = 실시간</b>.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Btn size="xs"  onClick={() => start("scan")} disabled={st?.running ?? false}
                  >
            ① 정찰 16묶음 배치 채우기
          </Btn>
          <Btn size="xs"  onClick={() => start("extract")} disabled={(st?.running ?? false) || !contractActive}
                  title={contractActive ? "추출 대기 전 건을 배치로 처리" : "①에서 Contract를 확정해야 추출을 채울 수 있습니다"}
                  >
            ③ 추출 대기 전건 배치 채우기
          </Btn>
        </div>
      </div>
      {err && <p className="mt-2 text-xs font-bold text-rust">{err}</p>}
      {st?.pending && !st.running && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-orange bg-rust-soft p-3 text-xs">
          <span className="text-ink">
            <b className="text-rust">수거되지 않은 배치가 있습니다</b> — <code>{st.pending.batchId}</code>.
            재배포·재시작으로 수거가 끊겼지만 <b>요청은 이미 제출·과금된 상태</b>라,
            재연결하면 결과를 그대로 받아 캐시에 적재합니다 (추가 비용 없음).
          </span>
          <Btn size="xs" variant="primary"  onClick={resume} disabled={resuming}
                  className={`ml-auto`}>
            {resuming ? "재연결 중…" : "배치 재연결"}
          </Btn>
        </div>
      )}
      {st && st.target && (
        <div className="mt-3.5 rounded-lg border border-glass-line bg-card p-3.5 text-[0.8125rem]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`mono rounded-lg px-2 py-0.5 text-[0.75rem] font-medium ${st.running ? "bg-orange-soft text-orange-deep" : "bg-fill-1 text-body"}`}>
              {st.running ? "배치 처리 중" : "종료"}
            </span>
            <span className="text-ink">대상 {st.target === "extract" ? "③ 추출" : "① 정찰"}</span>
            {st.batchId && <code className="text-muted">{st.batchId}</code>}
            {st.running && (
              <Btn size="xs" className="!border-rust !text-rust" onClick={stop} disabled={stopping}>
                {stopping ? "중지 요청 중…" : "중지"}
              </Btn>
            )}
            <span className="ml-auto text-muted">
              {!st.running && st.finishedAt && <>적재 {st.succeeded} · 실패 {st.errored} · </>}
              처리 대상 {st.total.toLocaleString()}건
              {st.target === "extract" && " (의료진 발언 블록 수 — 결과가 아니라 앞으로 호출할 횟수)"}
              {st.alreadyCached > 0 && ` · 이미 캐시된 ${st.alreadyCached}건 제외`}
            </span>
          </div>
          <div className="mt-2 max-h-40 space-y-0.5 overflow-auto font-mono text-[0.75rem]">
            {log.slice(-40).map((e) => (
              <div key={e.seq} className="text-muted">
                <span className="mr-2">{hhmmss(e.ts)}</span>
                <span className="text-ink">{e.messageKo}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
