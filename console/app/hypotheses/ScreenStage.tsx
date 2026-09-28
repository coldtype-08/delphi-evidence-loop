"use client";

/**
 * Screen 무대 — 릴레이(단계) + 증언대(검토관 4인) 한 화면 (08/31 시안 컨펌 · 팀장 피드백 반영).
 *
 * 읽는 순서가 곧 실행 순서다: 위 릴레이가 «지금 어디까지 왔나»를, 아래 증언대가
 * «누가 무엇을 말했나»를 답한다. 실행 중에는 각본 없이 **폴링이 받은 사실만** 그린다 —
 * 검토관별 진행은 서버 실행 기록(screenRun.agents)이 말하고, 화면은 옮겨 그릴 뿐이다.
 *
 * 팀장 피드백 반영 (08/31):
 *  - 검증 통과 표시는 발언 문장에 붙이지 않고 **행 우측에 따로 정렬** — 지지/반대(방향)와
 *    통과(검증)는 다른 축이다.
 *  - 실행 중인 검토관 기둥은 네온 글로우로 깜빡인다 (reduced-motion이면 정지 표시).
 *  - STEP 1 이름은 «AI Agent 동시 검토».
 *  - 서명 카드는 Human in the loop 하나만 말한다 — 출구 라벨 없이 버튼 둘.
 *
 * 안전성 한 줄은 증언대와 서명 카드 사이 — 이상사례 후보의 존재 여부만 사람 말로.
 * 내용은 절대 이 화면에 싣지 않는다(분리 원칙, 절대 규칙 #6) — 안전 화면으로만 잇는다.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Panel, Btn, Chip } from "@/app/components/ui";
import { AGENT_KO, REVIEW_REASON_KO, sourceLabel, sourceTitle } from "./screenShared";
import {
  IconScales, IconFlask, IconBook, IconChart, IconShield, IconVerified, IconUserCheck, IconBack,
} from "./ScreenIcons";

type Finding = {
  agent: string;
  findingType: "SUPPORT" | "COUNTER" | "GAP" | "SAFETY_SIGNAL";
  statementKo: string;
  sourceUrl: string | null;
  sourceLocator?: string | null;
  sourceAsOf: string | null;
  caveatKo: string | null;
};
type Excluded = { agent: string | null; reason: string; statementKo: string };
type SafCand = { id: string; verbatimQuote: string; status: string; routedAt: string };
type AgentRun = { state: "RUNNING" | "DONE"; startedAt?: string; finishedAt?: string };
type Run = {
  state: "RUNNING" | "DONE" | "FAILED";
  errorKo?: string;
  agents?: Record<string, AgentRun>;
  retries?: number;
  attempts?: number;
};
export type StageDetail = {
  id: string;
  titleKo: string;
  kind: "IN_LABEL" | "DEVELOPMENT";
  status: string;
  aggregate?: { claimCount?: number; distinctHcp?: number; distinctRegions?: number;
                recentCount?: number } | null;
  screenSummary?: { judgments: number; externalSupport: number; support: number; counter: number };
  screenFindings?: Finding[];
  screenReview?: { passed: number; excluded: Excluded[] };
  screenRun?: Run;
  evidenceReviewable?: boolean;
  evidenceReviewedBy?: string | null;
  evidenceReviewedAt?: string | null;
  canSendToBoard?: boolean;
};

/** 외부 검토관 4인 — 증언대의 기둥 순서. 내부 신호·안전성은 검토관이 아니다 (08/31 확정).
 *  short 는 릴레이 미니행용 — 긴 이름이 좁은 칸에서 잘리던 것 (08/31 피드백 #4). */
const REVIEWERS = [
  { agent: "EVIDENCE_OPENFDA", via: "openFDA", short: "허가·규제", Icon: IconScales },
  { agent: "EVIDENCE_CTGOV",   via: "CT.gov",  short: "임상개발", Icon: IconFlask },
  { agent: "EVIDENCE_PUBMED",  via: "PubMed",  short: "메디컬",   Icon: IconBook },
  { agent: "EVIDENCE_CMS",     via: "CMS Part D", short: "마켓",  Icon: IconChart },
] as const;

const RUNNABLE_FROM = ["DRAFT", "SCREEN_QUEUED", "BOARD_READY", "NOT_BOARD_READY"];

export default function ScreenStage({ initial }: { initial: StageDetail }) {
  const router = useRouter();
  const [d, setD] = useState<StageDetail>(initial);
  const [running, setRunning] = useState(initial.status === "SCREENING");
  const [stalled, setStalled] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // 안전 경로 원문 미리보기 (08/31 사용자 결정 — 규칙 #6 개정 검토와 함께 리뷰 대상).
  // **표시 전용이다**: screen_findings 에 저장되지 않고, 어떤 LLM 입력에도 들어가지 않고,
  // 종합·판정 카운트를 바꾸지 않는다. 분리 저장·격리 경로는 그대로다.
  const [safPreview, setSafPreview] = useState<SafCand[] | null>(null);
  const startedAt = useRef<number>(0);

  // 부모(서버 컴포넌트)가 리프레시로 새 initial을 내려보내면 그대로 받는다 —
  // 렌더 중 파생 동기화(React 권장 패턴). 가설이 바뀌는 경우는 key로 리마운트된다.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setD(initial);
    setRunning(initial.status === "SCREENING");
    setStalled(false);
    setErr(null);
  }

  // 실행 중 폴링 — 상태의 정본은 DB. 검토관별 진행(screenRun.agents)도 여기로 들어온다.
  useEffect(() => {
    if (!running) return;
    if (startedAt.current === 0) startedAt.current = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
      try {
        const nd = await api<StageDetail>(`/hypotheses/${d.id}`);
        if (stopped) return;
        // 실행 기록이 없거나 실패로 끝났는데 status만 SCREENING이면 죽은 흔적이다
        if (nd.status === "SCREENING" && (!nd.screenRun || nd.screenRun.state === "FAILED")) {
          setD(nd); setRunning(false); setStalled(true);
          if (nd.screenRun?.state === "FAILED") setErr(nd.screenRun.errorKo ?? null);
          return;
        }
        setD((prev) => ({ ...prev, ...nd }));
        if (nd.status !== "SCREENING") {
          setRunning(false);
          if (nd.screenRun?.state === "FAILED") setErr(nd.screenRun.errorKo ?? "실행 실패");
          router.refresh();
          window.dispatchEvent(new CustomEvent("delphi:pipeline-changed"));
          return;
        }
      } catch { /* 순단 — 다음 폴에서 */ }
      timer = setTimeout(tick, 2000);
    };
    timer = setTimeout(tick, 0);
    return () => { stopped = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, d.id]);

  // 중단 추정 뒤에도 느린 폴로 스스로 회복한다 (08/31 — 완주 후 배너 잔존 수정)
  useEffect(() => {
    if (!stalled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const probe = async () => {
      if (stopped) return;
      try {
        const nd = await api<StageDetail>(`/hypotheses/${d.id}`);
        if (stopped) return;
        if (nd.status !== "SCREENING") {
          setStalled(false); setErr(null); setD((prev) => ({ ...prev, ...nd }));
          router.refresh();
          return;
        }
        if (nd.screenRun?.state === "RUNNING") { setStalled(false); setRunning(true); return; }
      } catch { /* 순단 */ }
      timer = setTimeout(probe, 5000);
    };
    timer = setTimeout(probe, 5000);
    return () => { stopped = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stalled, d.id]);

  async function run() {
    setErr(null); setStalled(false); setBusy("run");
    try {
      await api(`/hypotheses/${d.id}/screen`, { method: "POST" });
      startedAt.current = Date.now();
      setElapsed(0);
      // **처음 검토처럼 시작한다 (08/31)** — 이전 실행의 판정·검토관 완료 기록이 로컬에
      // 남아 있으면 재실행 화면이 «이미 다 끝난» 모습에서 출발한다. 화면 상태만 비운다:
      // 서버 정본(저장된 판정)은 완주 시점에 교체되므로 건드리지 않고, 실패하면 기존
      // 판정이 그대로 남는 규약도 불변이다.
      setD((prev) => ({ ...prev, screenFindings: [], screenReview: undefined,
                        screenSummary: undefined,
                        screenRun: { state: "RUNNING", agents: {} } }));
      setSafPreview(null);
      setRunning(true);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  async function sign() {
    setBusy("sign"); setErr(null);
    try {
      await api(`/hypotheses/${d.id}/evidence-review`, {
        method: "POST", body: JSON.stringify({ reviewed: !d.evidenceReviewedAt }),
      });
      const nd = await api<StageDetail>(`/hypotheses/${d.id}`);
      setD((prev) => ({ ...prev, ...nd }));
      router.refresh();
      window.dispatchEvent(new CustomEvent("delphi:pipeline-changed"));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally { setBusy(null); }
  }

  async function move(to: "IN_REVIEW" | "DRAFT") {
    setBusy(to); setErr(null);
    try {
      const out = await api<{ moved: string[]; refused: { reasonKo: string }[] }>(
        "/hypotheses/transition",
        { method: "POST", body: JSON.stringify({ ids: [d.id], to }) });
      if (out.refused.length) setErr(out.refused[0].reasonKo);
      else {
        router.refresh();
        window.dispatchEvent(new CustomEvent("delphi:pipeline-changed"));
      }
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBusy(null); }
  }

  // 연관 SAF 식별번호 — locator(?focus=)와 판정문(SAF-#### 패턴) 양쪽에서 모은다 (08/31).
  // 옛 형식 기록(전역 건수만 있던 실행)은 번호가 없다 — 그때는 미리보기를 약속하지 않는다.
  function safIds(): string[] {
    const fromLocator = (safetyFinding?.sourceLocator?.split("focus=")[1] ?? "")
      .split(",").map((x) => x.trim());
    const fromStatement = safetyFinding?.statementKo?.match(/SAF-\d{4}/g) ?? [];
    return [...new Set([...fromLocator, ...fromStatement].filter(Boolean))];
  }

  async function loadSafPreview() {
    if (safPreview) return;
    try {
      const ids = new Set(safIds());
      if (ids.size === 0) { setSafPreview([]); return; }
      const all = await api<SafCand[]>("/safety/candidates", { role: "SAFETY" });
      setSafPreview(all.filter((c) => ids.has(c.id)));
    } catch {
      setSafPreview([]);   // 권한·순단 — 링크(안전 화면)가 정본 경로로 남는다
    }
  }

  const a = d.aggregate ?? {};
  const findings = d.screenFindings ?? [];
  const excluded = d.screenReview?.excluded ?? [];
  const agents = d.screenRun?.agents ?? {};
  const safetyFinding = findings.find((f) => f.agent === "SAFETY");
  const sup = d.screenSummary?.externalSupport ?? 0;
  // 외부 반대 = 외부 검토관의 COUNTER만 — 종합은 외부 판정만 센다 (08/31 확정)
  const con = findings.filter((f) => f.agent.startsWith("EVIDENCE_") && f.findingType === "COUNTER").length;
  const hasResult = findings.length > 0;
  const decided = ["APPROVED", "HOLD", "REJECTED", "IN_REVIEW"].includes(d.status);
  const signed = !!d.evidenceReviewedAt;

  // 릴레이 스텝 상태 — 실행 기록이 있으면 그것이, 없으면 결과 유무가 말한다
  const evStates = REVIEWERS.map((r) => agents[r.agent]?.state);
  const step1 = running
    ? (evStates.every((s) => s === "DONE") ? "done" : "now")
    : hasResult ? "done" : "idle";
  const step2 = running ? (agents["SAFETY"]?.state === "DONE" ? "done" : "dim")
    : hasResult ? "done" : "idle";
  const step3 = running
    ? (agents["VERIFY"]?.state === "DONE" ? "done" : agents["VERIFY"]?.state === "RUNNING" ? "now" : "dim")
    : hasResult ? "done" : "idle";
  const step4 = running ? "dim" : hasResult ? (signed ? "done" : "now") : "idle";
  // 지금 도는 단계의 이름 — «어느 단계가 돌아가는지»를 헤더가 말한다 (08/31 피드백 #1)
  const runningStepKo =
    step3 === "now" ? "STEP 3 · 검증 에이전트 대조 중"
    : step1 === "now" ? "STEP 1 · AI Agent 동시 검토 중"
    : "마무리 중";

  const stepCls = (st: string, extra = "") =>
    `relative min-w-[128px] flex-1 overflow-hidden rounded-xl border bg-card px-3 py-2.5 ${extra} ${
      st === "now" ? "border-orange ring-2 ring-orange-soft"
      : st === "done" ? "border-[#1FA97C]"
      : st === "dim" ? "border-line opacity-55" : "border-line"}`;

  return (
    <Panel pad="lg">
      {/* ── 머리: 정체 + 구분 + 상태 + 재실행 — **한 줄 고정** (08/31 피드백).
            구분 칩은 두 종류 다 단다: Development만 달면 카드마다 생김새가 갈리고,
            규칙 #5가 요구하는 것은 «구분이 보이는 것»이다 — In-label도 제 이름표를 단다.
            긴 SENSE 수치는 제목 아래 메타 줄로 내려 이 줄이 절대 감기지 않게 한다. */}
      <div className="flex flex-nowrap items-center gap-2.5">
        <span className="mono flex-none text-[0.75rem] font-semibold text-navy">{d.id}</span>
        <span className="flex-none"
              title={d.kind === "DEVELOPMENT"
                ? "미승인 적응증·환자군이라 전문조직 검토 경로로만 갑니다 — 상업 액션에 자동 연결되지 않습니다."
                : "허가 라벨 범위 안의 가설입니다."}>
          {d.kind === "DEVELOPMENT"
            ? <Chip tone="orange">Development</Chip>
            : <Chip>In-label</Chip>}
        </span>
        <span className={`mono ml-auto min-w-0 truncate text-[0.6875rem] font-semibold ${
          signed ? "text-green" : "text-orange-deep"}`}>
          {running ? `${runningStepKo}… ${elapsed}s`
            : stalled ? "검증이 중단된 것으로 보입니다"
            : signed ? "검토 완료 · 상정 가능"
            : hasResult ? "외부 근거 검토 필요" : "검증 전"}
        </span>
        {!running && !decided && RUNNABLE_FROM.includes(d.status) && (
          // 재실행은 눈에 띄되 오렌지(강조)까지는 아니다 (08/31) — 연한 남색 면 + 네이비 글자
          <Btn size="sm" onClick={run} disabled={busy === "run"}
               variant={hasResult ? undefined : "primary"}
               className={`flex-none whitespace-nowrap ${
                 hasResult ? "border-navy/25 bg-fill-2 font-bold text-navy hover:bg-navy/15" : ""}`}>
            {busy === "run" ? "시작 중…" : hasResult || stalled ? "Screen 재실행" : "Screen 실행"}
          </Btn>
        )}
      </div>

      <h2 className="mt-2.5 text-[1.0625rem] font-medium leading-[1.5] text-navy">{d.titleKo}</h2>
      {(a.claimCount ?? 0) > 0 && (
        <p className="mono mt-1 text-[0.6875rem] text-faint"
           title="이 수치가 임계를 넘어 가설이 됐습니다 — 내부 신호의 자리는 여기입니다">
          SENSE에서 넘어옴 — 반복 언급 {a.claimCount}회 · 독립 의료진 {a.distinctHcp}인 · {a.distinctRegions}개 권역
        </p>
      )}
      {err && <p className="mono mt-2 text-[0.75rem] leading-[1.6] text-rust">{err}</p>}

      {/* ── 교차검증 종합 — 외부 판정만, 검증을 지나야 선다 ── */}
      {hasResult && !running ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border
                        border-line bg-card px-4 py-2.5">
          <span className="text-[0.75rem] font-semibold text-navy">교차검증 종합</span>
          <span className="mono text-[0.9375rem] font-bold text-green">지지 {sup}</span>
          {sup + con > 0 && (
            <span className="flex h-2.5 min-w-[110px] flex-1 overflow-hidden rounded-md bg-fill-2" aria-hidden>
              <i className="block bg-[linear-gradient(90deg,#4FB894,var(--green))]" style={{ flex: sup }} />
              <i className="block bg-[linear-gradient(90deg,#D0736A,var(--rust))]" style={{ flex: con }} />
            </span>
          )}
          <span className="mono text-[0.9375rem] font-bold text-rust">반대 {con}</span>
          {excluded.length > 0 && (
            <span className="mono text-[0.75rem] text-faint">제외 {excluded.length}
              <small className="block text-[0.5625rem] leading-tight">검증 미통과</small></span>
          )}
          <span className="mono ml-auto text-[0.625rem] text-faint">개수는 SQL · 판단은 아래 서명자</span>
        </div>
      ) : (
        <div className="mono mt-3.5 rounded-xl border border-dashed border-line bg-card px-4 py-2.5
                        text-[0.75rem] text-faint">
          교차검증 종합 — {running ? "집계 전 · 검증 에이전트를 지나야 셉니다" : "검증을 실행하면 여기에 섭니다"}
        </div>
      )}

      {/* ── 릴레이 — 4단계. 기본은 한 화면에 4장 — 고정폭 대신 flex-1로 나눠 갖는다 (08/31) ── */}
      <div className="mt-3 flex items-stretch gap-3 overflow-x-auto py-0.5"
           role="list" aria-label="검증 단계">
        <div role="listitem"
             className={stepCls(step1, `min-w-[168px] ${running && step1 === "now" ? "glow-running" : ""}`)}>
          {step1 === "now" && <span className="progress-shimmer" aria-hidden />}
          <div className="mono text-[0.5625rem] font-bold tracking-wider text-orange-deep">STEP 1 · 검토</div>
          <div className="text-[0.75rem] font-bold text-navy">AI Agent 동시 검토</div>
          <div className="mt-1.5 flex flex-col gap-1">
            {REVIEWERS.map(({ agent, short, Icon }) => {
              const st = agents[agent]?.state;
              const fs = findings.filter((f) => f.agent === agent && f.findingType !== "GAP");
              const s = fs.filter((f) => f.findingType === "SUPPORT").length;
              const c = fs.filter((f) => f.findingType === "COUNTER").length;
              return (
                <div key={agent} className="flex items-center gap-1.5 text-[0.65rem]">
                  <Icon className="h-3 w-3 flex-none text-navy/70" />
                  <span className="min-w-0 flex-1 whitespace-nowrap font-semibold text-ink"
                        title={AGENT_KO[agent]}>{short}</span>
                  <span className="mono text-[0.6rem] font-bold">
                    {running
                      ? (st === "DONE" ? <span className="text-green">완료 ✓</span>
                        : st === "RUNNING" ? <span className="pulse-soft text-orange-deep">● 검토 중</span>
                        : <span className="text-faint">대기</span>)
                      : !hasResult ? <span className="text-faint">—</span>
                      : s + c > 0
                        ? <><span className="text-green">{s > 0 ? `지지 ${s}` : ""}</span>
                           {s > 0 && c > 0 ? " · " : ""}
                           <span className="text-rust">{c > 0 ? `반대 ${c}` : ""}</span></>
                        : <span className="text-faint">미조회</span>}
                  </span>
                </div>
              );
            })}
          </div>
          <span className="pointer-events-none absolute -right-[12px] top-1/2 hidden -translate-y-1/2
                           text-[13px] text-[color:var(--line-2)] sm:block" aria-hidden>▸</span>
        </div>

        <div role="listitem" className={stepCls(step2, "border-dashed")}>
          <div className="mono text-[0.5625rem] font-bold tracking-wider text-orange-deep">STEP 2 · 안전</div>
          <div className="flex items-center gap-1.5 text-[0.75rem] font-bold text-navy">
            <IconShield className="h-3.5 w-3.5" />이상사례 확인
          </div>
          <p className="mt-1.5 text-[0.6875rem] leading-[1.55] text-body">
            {safetyFinding
              ? <b className="text-orange-deep">같은 면담에 의심 보고 있음</b>
              : hasResult ? <>이상사례 없음</> : <span className="text-faint">검증 실행과 함께 확인</span>}
          </p>
          <span className="pointer-events-none absolute -right-[12px] top-1/2 hidden -translate-y-1/2
                           text-[13px] text-[color:var(--line-2)] sm:block" aria-hidden>▸</span>
        </div>

        <div role="listitem" className={stepCls(step3, running && step3 === "now" ? "glow-running" : "")}>
          {step3 === "now" && <span className="progress-shimmer" aria-hidden />}
          <div className="mono text-[0.5625rem] font-bold tracking-wider text-orange-deep">STEP 3 · 검증</div>
          <div className="flex items-center gap-1.5 text-[0.75rem] font-bold text-navy">
            <IconVerified className="h-3.5 w-3.5" />검증 에이전트
          </div>
          <p className="mt-1.5 text-[0.6875rem] leading-[1.55] text-body">
            {running
              ? (step3 === "now" ? <span className="pulse-soft text-orange-deep">출처·사실 대조 중…</span>
                 : step3 === "done" ? "대조 완료" : <span className="text-faint">발언 합류 대기</span>)
              : hasResult
                ? <>통과 <b className="text-green">{d.screenReview?.passed ?? 0}</b>
                   {excluded.length > 0 && <> · 제외 <b className="text-rust">{excluded.length}</b></>}
                   <span className="block text-[0.625rem] text-faint">
                     출처를 대지 못한 발언은 싣지 않는다
                   </span></>
                : <span className="text-faint">모든 발언의 출처를 대조</span>}
          </p>
          <span className="pointer-events-none absolute -right-[12px] top-1/2 hidden -translate-y-1/2
                           text-[13px] text-[color:var(--line-2)] sm:block" aria-hidden>▸</span>
        </div>

        <div role="listitem" className={stepCls(step4, "border-[1.5px] border-navy/70")}>
          <div className="mono text-[0.5625rem] font-bold tracking-wider text-orange-deep">STEP 4 · 서명</div>
          <div className="flex items-center gap-1.5 text-[0.75rem] font-bold text-navy">
            <IconUserCheck className="h-3.5 w-3.5" />사람의 서명
          </div>
          <p className="mt-1.5 text-[0.6875rem] leading-[1.55] text-body">
            {signed ? <span className="text-green">서명 완료</span>
              : hasResult && !running ? "아래 근거를 읽고 서명"
              : <span className="text-faint">AI는 여기를 지나지 못함</span>}
          </p>
        </div>
      </div>

      {/* ── 증언대 — 검토관 4기둥 ── */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {REVIEWERS.map(({ agent, via, Icon }) => {
          const st = agents[agent]?.state;
          const isRunning = running && st === "RUNNING";
          const mine = findings.filter((f) => f.agent === agent);
          const judged = mine.filter((f) => f.findingType !== "GAP");
          const gap = mine.find((f) => f.findingType === "GAP");
          const myExcluded = excluded.filter((x) => x.agent === agent);
          const s = judged.filter((f) => f.findingType === "SUPPORT").length;
          const c = judged.filter((f) => f.findingType === "COUNTER").length;
          return (
            <div key={agent}
                 className={`flex flex-col overflow-hidden rounded-xl border bg-card ${
                   isRunning ? "glow-running border-orange"
                   : running && !st ? "border-dashed border-line opacity-60" : "border-line"}`}>
              <header className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-fill-2 text-navy">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[0.8125rem] leading-[1.35] text-navy">{AGENT_KO[agent]}</b>
                  <span className="mono text-[0.575rem] text-faint">
                    {via}{judged[0]?.sourceAsOf ? ` · 스냅샷 ${judged[0].sourceAsOf}` : ""}
                  </span>
                </span>
                <div className="flex flex-none flex-wrap justify-end gap-1.5">
                  {isRunning ? <Chip tone="orange">자료 대조 중…</Chip>
                    : running && st === "DONE" ? <Chip tone="green">검토 완료</Chip>
                    : running ? <Chip>대기</Chip>
                    : judged.length > 0 ? (
                      <>
                        {s > 0 && <Chip tone="green">지지 {s}</Chip>}
                        {c > 0 && <Chip tone="rust">반대 {c}</Chip>}
                      </>
                    ) : hasResult ? <Chip>미조회</Chip> : <Chip>검증 전</Chip>}
                </div>
              </header>
              <div className="flex flex-1 flex-col gap-3 px-3.5 py-3">
                {/* 통과 발언 — 좌: 방향+문장, 우: 검증 배지(별도 축) */}
                {!running && judged.map((f, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2">
                    <div className={`min-w-0 border-l-[3px] pl-2.5 ${
                      f.findingType === "SUPPORT" ? "border-[#1FA97C]" : "border-rust"}`}>
                      <span className={`mono block text-[0.575rem] font-bold ${
                        f.findingType === "SUPPORT" ? "text-green" : "text-rust"}`}>
                        {f.findingType === "SUPPORT" ? "지지" : "반대"}
                      </span>
                      <p className="text-[0.76rem] leading-[1.65] text-body">
                        {f.statementKo}
                        {f.sourceUrl && (
                          <>{" "}
                            <a href={f.sourceUrl} target="_blank" rel="noreferrer"
                               title={sourceTitle(f.sourceUrl)}
                               className="mono whitespace-nowrap text-[0.625rem] text-orange-deep
                                          underline underline-offset-2">
                              {sourceLabel(f.sourceUrl)}
                            </a>
                          </>
                        )}
                        {/* caveat(해석 한계)는 화면에 표시하지 않는다 (08/31 사용자 결정 —
                            출처 링크가 붙어 있고 사람 검토 단계가 있다). 데이터는 그대로:
                            출처 검증이 caveat 없는 판정을 걸러내는 조건은 유지된다. */}
                      </p>
                    </div>
                    {/* 검증 통과 — 방향과 다른 축이라 우측에 따로 선다 (08/31 팀장 피드백) */}
                    <span className="mono shrink-0 self-start whitespace-nowrap rounded-md bg-green-soft
                                     px-1.5 py-0.5 text-[0.55rem] font-bold text-green"
                          title="검증 에이전트의 출처·사실 대조를 통과한 발언입니다">
                      검증 통과 ✓
                    </span>
                  </div>
                ))}

                {/* 제외 발언 — 원문 보존 취소선 + 사유. 종합에 안 섞인다 */}
                {!running && myExcluded.map((x, i) => (
                  <div key={`x${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 opacity-80">
                    <div className="min-w-0 border-l-[3px] border-line-2 pl-2.5">
                      <span className="mono block text-[0.575rem] font-bold text-rust">제외</span>
                      <p className="text-[0.76rem] leading-[1.6] text-muted line-through
                                    decoration-[color:var(--line-2)]">{x.statementKo || "(빈 발언)"}</p>
                      <span className="mt-0.5 block text-[0.65rem] leading-[1.5] text-rust no-underline">
                        {REVIEW_REASON_KO[x.reason] ?? x.reason} — 종합에 세지 않음
                      </span>
                    </div>
                    <span className="mono shrink-0 self-start whitespace-nowrap rounded-md bg-fill-2
                                     px-1.5 py-0.5 text-[0.55rem] font-bold text-muted">제외</span>
                  </div>
                ))}

                {/* 미조회 / 실행 중 / 검증 전 상태문 — 사람 말만 */}
                {!running && judged.length === 0 && myExcluded.length === 0 && (
                  <p className="text-[0.72rem] leading-[1.7] text-muted">
                    {gap ? (
                      // GAP 사유는 서버가 원인별로 말한다 — 설계상 공백(연령 범위 밖)은
                      // 재실행해도 안 채워지므로 문구를 지어내지 않는다 (08/31 피드백 #2)
                      <>
                        {gap.statementKo}
                        {gap.caveatKo && (
                          <span className="mt-1 block text-[0.65rem] text-faint">{gap.caveatKo}</span>
                        )}
                      </>
                    ) : hasResult ? (
                      <>이번 실행에서 판정을 받지 못했습니다 — 응답이 비어 있었습니다.<br />
                        <b className="text-ink">재실행으로 다시 물을 수 있습니다.</b></>
                    ) : "검증을 실행하면 이 검토관의 의견이 여기 섭니다."}
                  </p>
                )}
                {isRunning && (
                  <p className="pulse-soft text-[0.72rem] leading-[1.7] text-orange-deep">
                    공개 자료를 대조하는 중…
                  </p>
                )}
                {running && st === "DONE" && (
                  <p className="text-[0.72rem] leading-[1.7] text-muted">
                    검토를 마쳤습니다 — 검증 에이전트 대조 후 발언이 공개됩니다.
                  </p>
                )}
                {running && !st && (
                  <p className="text-[0.72rem] leading-[1.7] text-faint">차례를 기다리는 중.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 안전성 한 줄 — 증언대와 서명 사이 (08/31 팀장 확정 위치) ── */}
      <div className={`mt-3 flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-2.5 ${
        safetyFinding ? "border-orange bg-orange-soft/20" : "border-line bg-card"}`}>
        <IconShield className={`h-4 w-4 flex-none ${safetyFinding ? "text-orange-deep" : "text-green"}`} />
        {safetyFinding ? (
          <>
            <p className="min-w-0 flex-1 text-[0.78rem] leading-[1.6] text-body">
              <b className="text-ink">{safetyFinding.statementKo}</b>
              {safetyFinding.caveatKo && (
                <span className="block text-[0.6875rem] text-muted">{safetyFinding.caveatKo}</span>
              )}
            </p>
            <Link href={safetyFinding.sourceLocator || "/safety"}
                  className="mono whitespace-nowrap text-[0.6875rem] font-semibold text-orange-deep
                             underline underline-offset-2"
                  title="해당 건들이 맨 위에 표시된 안전 화면이 열립니다">
              안전 화면에서 확인 →
            </Link>
            {safIds().length === 0 ? (
              <p className="mono w-full basis-full text-[0.625rem] text-faint">
                이전 형식의 기록입니다 — 재실행하면 이 가설과 연관된 원문을 여기서 바로 볼 수 있습니다.
              </p>
            ) : (
            <details className="w-full basis-full">
              <summary onClick={() => void loadSafPreview()}
                       className="mono cursor-pointer list-none text-[0.625rem] text-faint
                                  underline decoration-dotted underline-offset-2"
                       title="읽기 전용 — 이 화면의 판정·집계에는 쓰이지 않습니다">
                원문 미리보기
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {safPreview === null && <p className="mono text-[0.625rem] text-faint">불러오는 중…</p>}
                {safPreview?.length === 0 && (
                  <p className="mono text-[0.625rem] text-faint">
                    번호에 해당하는 원문을 찾지 못했습니다 — 안전 화면에서 확인하세요.</p>
                )}
                {safPreview?.map((c) => (
                  <blockquote key={c.id}
                              className="rounded-lg border border-line bg-fill-1 px-3 py-2 text-[0.75rem]
                                         leading-[1.65] text-body">
                    <span className="mono mr-2 text-[0.625rem] font-bold text-navy">{c.id}</span>
                    “{c.verbatimQuote}”
                  </blockquote>
                ))}
              </div>
            </details>
            )}
          </>
        ) : (
          <p className="text-[0.78rem] text-body">
            {hasResult && !running
              ? <><b className="text-ink">안전성 이상사례 없음</b> — 이 가설의 근거 발언이 나온
                 면담들에서 이상사례 의심 보고가 확인되지 않았습니다.</>
              : <span className="text-muted">안전성 이상사례 확인은 검증 실행과 함께 이뤄집니다.</span>}
          </p>
        )}
      </div>

      {/* ── 검토 서명 — Human in the loop. AI는 여기를 대신 지나지 못한다 ── */}
      <div className="mt-3 rounded-xl border border-line bg-fill-1 px-4 py-3">
        <label className={`flex items-start gap-2.5 ${
          d.evidenceReviewable ? "cursor-pointer" : "cursor-not-allowed"}`}>
          <input type="checkbox" checked={signed} disabled={!d.evidenceReviewable || busy === "sign"}
                 onChange={sign}
                 className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--orange-deep)] disabled:opacity-40" />
          <span className="min-w-0 flex-1">
            <b className={`block text-[0.8125rem] font-medium leading-[1.5] ${
              d.evidenceReviewable ? "text-navy" : "text-muted"}`}>
              외부 근거를 직접 검토했습니다
            </b>
            <span className="mono mt-0.5 block text-[0.6875rem] leading-[1.6] text-body">
              {!d.evidenceReviewable
                ? "검증이 끝나면 서명할 수 있습니다."
                : signed
                  ? `${d.evidenceReviewedBy ?? "—"} · ${(d.evidenceReviewedAt ?? "").slice(0, 16).replace("T", " ")}`
                  : "위 발언을 읽은 사람의 서명이 있어야 다음으로 갑니다."}
            </span>
          </span>
        </label>
        {!decided && hasResult && !running && (
          <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-2.5">
            <Btn size="sm" onClick={() => move("DRAFT")} disabled={!!busy}
                 title="신호가 더 필요하다는 판단 — Sense 명부로 돌아가고, 판정 이력은 남습니다.">
              <IconBack className="h-3.5 w-3.5" />
              {busy === "DRAFT" ? "보내는 중…" : "Sense로 보내기 — 신호 더 쌓기"}
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => move("IN_REVIEW")}
                 disabled={!!busy || d.canSendToBoard === false}
                 title={d.canSendToBoard === false
                   ? "검토 서명에 체크하면 상정할 수 있습니다" : undefined}>
              {busy === "IN_REVIEW" ? "보내는 중…" : "AI Board 심의로 보내기"}
            </Btn>
          </div>
        )}
      </div>
    </Panel>
  );
}
