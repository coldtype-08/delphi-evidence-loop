"use client";

/** Screen 실행 + 근거 판정 표시 — 관통 시연의 가시 장면 (08/25 소정 · 08/27 폴링/2분법 개편).
 *
 *  실행은 서버가 뒤에서 돌린다(요청 즉시 응답) — 이 컴포넌트는 가설 상세를 2초마다
 *  폴링해 status가 SCREENING을 벗어나면 결과를 그린다. 새로고침해도 SCREENING이면
 *  폴링이 저절로 재개된다(상태의 정본이 DB라서 가능한 일).
 *
 *  **Board 층 카드 전용이다 (08/31).** Screen 워크벤치는 ScreenStage 가 실행·폴링·
 *  렌더를 전부 가졌으므로, 이 컴포넌트는 안건 대장 밖의 카드(HypCard 계열)에서만
 *  쓰인다 — 렌더 정본이 두 곳이 되지 않게 워크벤치에서는 부르지 않는다.
 *
 *  판정은 지지/반대 2분법 (08/27 회의 — 공백 폐지, 근거를 못 찾은 것도 반대다).
 *  코드가 만드는 GAP 행 하나만 남는데 그것은 판정이 아니라 "조회 재료 없음" 경고라
 *  칩이 아닌 경고 박스로 가른다. 이중 확인(출처 검증)의 제외 내역도 감추지 않고 보인다.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Panel, Btn, Chip } from "@/app/components/ui";
import { AGENT_KO, AGENT_VIA, TYPE_KO, REVIEW_REASON_KO, sourceLabel, sourceTitle } from "./screenShared";

type Finding = {
  agent: string;
  findingType: "SUPPORT" | "COUNTER" | "GAP" | "SAFETY_SIGNAL";
  statementKo: string;
  sourceUrl: string | null;
  sourceLocator: string | null;
  sourceAsOf: string | null;
  caveatKo: string | null;
};

type Review = {
  passed: number;
  excluded: { agent: string | null; reason: string; statementKo: string }[];
  scope: "latest-run" | "history";
};

type Run = { state: "RUNNING" | "DONE" | "FAILED"; errorKo?: string };

type Detail = { status: string; screenFindings: Finding[]; screenReview?: Review; screenRun?: Run };

// 색이 뜻하는 것은 세기가 아니라 **방향**이다 (08/27 회의 결정 유지)
const TYPE_TONE: Record<string, "plain" | "orange" | "navy" | "green" | "rust"> = {
  SUPPORT: "green",       // 지지 — 이 가설을 받치는 외부 근거
  COUNTER: "rust",        // 반대 — 반하는 근거, 또는 "찾아봤는데 근거가 없다"(근거 부족)
  SAFETY_SIGNAL: "orange",
};

export default function ScreenRunner({ hypId, status }: { hypId: string; status: string }) {
  const router = useRouter();
  // 새로고침해도 SCREENING이면 실행 중 화면으로 복귀한다.
  // 다만 **status 만으로는 살았는지 죽었는지 알 수 없다** — 서버가 재시작하거나 실행이
  // 도중에 끊기면 status 는 SCREENING 인데 도는 것은 없다. 그때 스피너를 계속 돌리면
  // 사람은 영원히 기다리게 되고, 실행 버튼은 숨겨져 있어 **되살릴 길이 화면에 없다**.
  // 서버는 그 경우 재실행을 정상 경로로 열어 둔다 — 화면이 그 문을 가리면 안 된다.
  const [running, setRunning] = useState(status === "SCREENING");
  const [stalled, setStalled] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [open, setOpen] = useState(false);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!running) return;
    if (startedAt.current === 0) startedAt.current = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
      try {
        const d = await api<Detail>(`/hypotheses/${hypId}`);
        if (stopped) return;
        // 실행 기록이 없거나 실패로 끝났는데 status 만 SCREENING 이면 **죽은 흔적**이다.
        // 폴링을 멈추고 사실대로 말한다 — 서버는 이 상태에서 재실행을 허용한다.
        if (d.status === "SCREENING" && (!d.screenRun || d.screenRun.state === "FAILED")) {
          setDetail(d);
          setRunning(false);
          setStalled(true);
          if (d.screenRun?.state === "FAILED") setError(d.screenRun.errorKo ?? null);
          return;
        }
        if (d.status !== "SCREENING") {
          // 완주 또는 실패 — 실패면 서버가 상태를 실행 전으로 되돌리고 사유를 실어 준다
          setDetail(d);
          setRunning(false);
          setOpen(true);
          if (d.screenRun?.state === "FAILED") setError(d.screenRun.errorKo ?? "실행 실패");
          router.refresh();
          window.dispatchEvent(new CustomEvent("delphi:pipeline-changed"));
          return;
        }
      } catch {
        // 순단은 다음 폴에서 재시도 — 실행 자체는 서버에서 계속 돈다
      }
      timer = setTimeout(tick, 2000);
    };
    timer = setTimeout(tick, 0);
    return () => { stopped = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, hypId]);

  // **중단 표시는 스스로 회복한다 (08/31 — 오류 #1 잔존 수정).** «중단된 것으로
  // 보입니다»는 한 번의 폴로 내린 추정인데, 실행 등록 직전의 순간을 밟았거나 실행이
  // 사실 살아 있으면 **완주해도 붉은 배너가 남았다** — 폴링이 멈춰 있어 아무도 안
  // 지웠기 때문이다. 그래서 stalled 동안에도 5초 간격의 느린 폴을 유지한다: status 가
  // SCREENING 을 벗어나면 배너를 내리고 서버 컴포넌트를 새로 그린다. 살아 있던
  // 실행이 이어지고 있으면(RUNNING 기록 복귀) 정상 폴링으로 되돌아간다.
  useEffect(() => {
    if (!stalled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const probe = async () => {
      if (stopped) return;
      try {
        const d = await api<Detail>(`/hypotheses/${hypId}`);
        if (stopped) return;
        if (d.status !== "SCREENING") {
          setStalled(false);
          setError(null);
          router.refresh();
          window.dispatchEvent(new CustomEvent("delphi:pipeline-changed"));
          return;
        }
        if (d.screenRun?.state === "RUNNING") {
          setStalled(false);
          setRunning(true);
          return;
        }
      } catch {
        /* 순단 — 다음 폴에서 */
      }
      timer = setTimeout(probe, 5000);
    };
    timer = setTimeout(probe, 5000);
    return () => { stopped = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stalled, hypId]);

  async function loadFindings() {
    const d = await api<Detail>(`/hypotheses/${hypId}`);
    setDetail(d);
    setOpen(true);
  }

  async function run() {
    setError(null);
    // **중단 표시를 내린다.** 안 내리면 "검토관 실행 중"과 "중단된 것으로 보입니다"가
    // 한 줄에 같이 뜨고, 실행 중에도 재실행 버튼이 남아 두 번째 클릭이 409 를 받는다.
    setStalled(false);
    try {
      await api(`/hypotheses/${hypId}/screen`, { method: "POST" });
      startedAt.current = Date.now();
      setElapsed(0);
      setOpen(false);
      setRunning(true);
      router.refresh();          // 카드의 status 뱃지가 "근거 수집 중"으로
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // **심의에 오른 뒤에는 실행 버튼을 내지 않는다 (08/29).** IN_REVIEW 에서 Screen 을 다시
  // 돌리면 status 가 SCREENING 으로 내려가고 판정이 지워진다 — 심의 대기 목록에서 조용히
  // 사라진다. 되돌리려면 사람이 [Screen 으로 되돌리기]를 눌러야 한다(HUMAN_TRANSITIONS의
  // IN_REVIEW→BOARD_READY). 그 걸음을 건너뛰는 길을 화면이 열어 두면 안 된다.
  const decided = ["APPROVED", "HOLD", "REJECTED", "IN_REVIEW"].includes(status);
  if (status === "RETIRED") return null;   // 근거가 사라진 가설 — 실행 대상이 아니다
  // DRAFT도 실행 대상이다 (#80): 생성된 가설은 예외 없이 Screen 검증을 받는다

  const findings = detail?.screenFindings ?? null;
  const judgments = (findings ?? []).filter((f) => f.findingType !== "GAP");
  const axisGaps = (findings ?? []).filter((f) => f.findingType === "GAP");
  const review = detail?.screenReview;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {!decided && (!running || stalled) && (
          <Btn variant="primary" size="sm" onClick={run}>
            {["DRAFT", "SCREEN_QUEUED"].includes(status) ? "Screen 실행" : "Screen 재실행"}
          </Btn>
        )}
        {running && (
          <span className="mono text-[0.8125rem] font-medium text-orange-deep">
            검토관 실행 중… {elapsed}s — 화면을 닫아도 실행은 계속됩니다
          </span>
        )}
        {stalled && (
          <span className="mono text-[0.8125rem] font-medium text-rust">
            검증이 중단된 것으로 보입니다 — 다시 실행할 수 있습니다
          </span>
        )}
        {!running && (
          <Btn
            size="sm"
            onClick={() => (open ? setOpen(false) : loadFindings().catch(() => setOpen(false)))}
          >
            {open ? "근거 접기" : "근거 보기"}
          </Btn>
        )}
      </div>
      {error && <p className="mono mt-2 text-[0.8125rem] leading-[1.6] text-rust">{error}</p>}

      {open && findings && (
        <div className="mt-2.5 flex flex-col gap-2">
          {/* 이중 확인(출처 검증) — 통과·제외를 나란히. 제외를 감추면 검증이 안 보인다 */}
          {review && (
            <p className="mono text-[0.75rem] text-body">
              출처 확인 통과 <b className="text-navy">{review.passed}</b>
              {" · "}걸러짐 <b className={review.excluded.length ? "text-rust" : "text-navy"}>
                {review.excluded.length}</b>
              {review.scope === "history" && <span> · 누적 이력 기준</span>}
            </p>
          )}
          {review && review.excluded.length > 0 && (
            <Panel tone="inset" pad="sm">
              <p className="mono text-[0.75rem] font-bold text-muted">확인에서 걸러진 판정</p>
              <ul className="mt-1 flex flex-col gap-1">
                {review.excluded.map((x, i) => (
                  <li key={i} className="text-[0.8125rem] leading-[1.6] text-body">
                    <b className="text-rust">{REVIEW_REASON_KO[x.reason] ?? x.reason}</b>
                    {" — "}{AGENT_KO[x.agent ?? ""] ?? x.agent}
                    {x.statementKo && <span className="text-muted"> · {x.statementKo}</span>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {/* 조회 재료 없음 — 판정이 아니라 시스템 경고. 반대(근거를 보고 내린 판정)와 가른다.
              문구(08/30): GAP의 원인이 축 미설정만이 아니게 됐다(인구형 라벨 판독 전·원천 범위 밖) */}
          {axisGaps.length > 0 && (
            <Panel tone="inset" pad="sm">
              <p className="text-[0.8125rem] font-bold text-orange-deep">
                ⚠ 조회 재료 없음 — 판정 아님
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {axisGaps.map((f, i) => (
                  <li key={i} className="text-[0.8125rem] leading-[1.6] text-body">
                    <span className="mono">{AGENT_KO[f.agent] ?? f.agent}</span> — {f.statementKo}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <ul className="flex flex-col gap-2">
            {judgments.length === 0 && axisGaps.length === 0 && (
              <li className="text-[0.875rem] text-muted">아직 판정이 없습니다 — Screen을 실행하세요.</li>
            )}
            {judgments.map((f, i) => (
              <li key={i}>
                <Panel tone="inset" pad="sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={TYPE_TONE[f.findingType] ?? "plain"}>
                      {TYPE_KO[f.findingType] ?? f.findingType}
                    </Chip>
                    <span className="mono text-[0.75rem] text-muted">
                      {AGENT_KO[f.agent] ?? f.agent} · {AGENT_VIA[f.agent] ?? ""}
                    </span>
                  </div>
                  <p className="mt-2 text-[0.875rem] leading-[1.65] text-navy">{f.statementKo}</p>
                  {f.caveatKo && (
                    <p className="mt-1 text-[0.875rem] leading-[1.6] text-orange-deep">⚠ {f.caveatKo}</p>
                  )}
                  <p className="mono mt-1.5 text-[0.75rem] text-muted">
                    {f.sourceAsOf && <span>스냅샷 {f.sourceAsOf} · </span>}
                    {f.sourceUrl && (
                      <a href={f.sourceUrl} target="_blank" rel="noreferrer" title={sourceTitle(f.sourceUrl)}
                         className="text-orange-deep underline underline-offset-2">
                        {sourceLabel(f.sourceUrl)}
                      </a>
                    )}
                  </p>
                </Panel>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
