"use client";

/**
 * 처리 라인 — 원석 한 건이 에이전트 3종을 지나 구조화되는 과정을 눈으로 본다 (08/22 신설).
 * [오너: 건태 — 도메인 화면. 디자인 토큰 정리는 소정 8/24]
 *
 * 이 화면의 목적은 "됐다"가 아니라 **"어떻게 됐는지"**를 보여주는 것이다.
 *  ① Contract 설계자 — 원석을 읽고 뽑을 항목 자체를 제안 (활성 Contract는 안 바뀐다)
 *  ② 발언 귀속자     — 한 문서 안에서 누가 말했는지 구간을 가르고, 정답과 대조해 점수를 낸다
 *  ③ 인사이트 분석가 — 그 구간을 읽고 스키마 항목으로 뽑는다. 근거가 원문과 다르면 버려진다
 *
 * 버려진 건수(`rejectedNoEvidence`)를 숨기지 않고 같은 크기로 보여준다 — 막고 있다는 증거이므로.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type {
  Agent, DocRow, DocDetail, Attribution, StoredAttribution, Extraction, Claim, Proposal, FullScan, Strip, SourceCheck, ParseScan, BlockLedger, ClaimsTable,
} from "./_lib/types";
import { hhmmss } from "./_lib/format";
import { Btn, Chip, Eyebrow, Fold, Panel, TH, Topbar } from "@/app/components/ui";
import FixedHeaderPanel from "./_panels/FixedHeaderPanel";
import StageStat from "./_panels/StageStat";
import StripBar from "./_panels/StripBar";
import Stage from "./_panels/Stage";
import SubStep, { type SubStepState } from "./_panels/SubStep";
import ProductStrip from "./_panels/ProductStrip";
import LineStatus from "./_panels/LineStatus";
import RawText from "./_panels/RawText";
import ActiveSchemaList from "./_panels/ActiveSchemaList";
import ExternalTermsPanel from "./_panels/ExternalTermsPanel";
import LiveRunner from "./_panels/LiveRunner";


// ── 원문 뷰어: 단계에 따라 다른 것을 덮어씌운다 ─────────────────────────────


// ── 단계 카드 ───────────────────────────────────────────────────────────────

// 제품 맥락 (08/25) — "이 시스템이 어느 약의 신호를 다루는가"를 화면이 말한다.
// 출처는 GET /system/product (app/product.py 도메인 상수) — 프론트 하드코딩이 아니다.















// ── 처리 결과 계기판 — 원석 → 기록 → 구조화 신호 → 가설 (docs/04 §3) ──
// 08/30(#115): 「신호(잠정/공식 나란히)」였다. 절대 규칙 #3 개정으로 승인이 수집 시점으로
// 옮겨지면서 이 라인의 산출물에는 「승인 전 잠정」이라는 상태가 없어졌다 (StripBar 참조).
// 페이지 맨 아래에 둔다: 이 숫자는 라인의 "출발점"이 아니라 위 단계들이 흐른 끝의 결과다 (08/24).


// ── 가설 — 임계를 넘은 조합이 자동으로 가설이 된다 (docs/01 §3, 08/25) ─────────
// 이 섹션이 파이프라인의 최종 산출물이다: 여기 나온 가설을 Screen·Board가 이어받고,
// 다른 팀원은 GET /hypotheses 로 같은 데이터를 가져간다.




// ── 코퍼스 연속 처리 — 실제 호출이 로그로 흐른다 (docs/04 §8.5) ────────────────

// 비용 요약 (08/25) — "비용 효율 구조"를 주장이 아니라 실측으로. 전부 SQL 합계.



// ── 배치 프리로드 — 대량 호출을 배치 API(반값)로 캐시에 채운다 (08/25 팀장 결정) ──
// 배치는 claim을 만들지 않는다: 캐시만 채우고, 적재는 기존 실행 버튼이 캐시 재생(0원)으로
// 한다 — 검증 경로가 갈라지지 않는다. 모든 건이 llm_runs에 call_mode=BATCH로 남는다.





// ── 페이지 ──────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [attr, setAttr] = useState<Attribution | null>(null);
  const [extract, setExtract] = useState<Extraction | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposeSample, setProposeSample] = useState(12);
  const [strip, setStrip] = useState<Strip | null>(null);
  const [docsLoaded, setDocsLoaded] = useState(false);
  // 새로고침하면 ⓪을 다시 눌러야 했다 (08/27 팀장 지적). ⓪은 결정론·무료지만 아래 단계
  // 전부가 여기 걸려 있어서, 화면을 한 번 새로 그릴 때마다 라인이 처음으로 돌아갔다.
  //
  // 서버 상태로는 못 가른다 — 시드가 원본을 파싱해 적재하므로 DB는 **항상** 파싱돼 있다.
  // 잃어버린 사실은 "이 브라우저에서 ⓪을 이미 눌렀다"이고, 그건 브라우저에만 있다.
  // 그래서 브라우저에 남긴다. [원본 불러오기] 연출은 그대로 남는다(리셋하면 새 상태에서 시작).
  const [restored, setRestored] = useState(false);
  const [scan, setScan] = useState<ParseScan | null>(null);   // ⓪ 전건 파싱 실측
  const [ledger, setLedger] = useState<BlockLedger | null>(null); // 원석 블록 원장 (SQL)
  const [table, setTable] = useState<ClaimsTable | null>(null); // AI Readable 실물 테이블
  const [busy, setBusy] = useState<string | null>(null);
  const [busySec, setBusySec] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const agentOf = (name: string) => agents.find((a) => a.agent === name);

  useEffect(() => {
    if (!busy) { setBusySec(0); return; }
    const t = setInterval(() => setBusySec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const refreshStrip = useCallback(() => {
    api<Strip>("/aggregates/pipeline").then(setStrip).catch(() => {});
    // AI Readable 실물 테이블 — limit=0 = 전량 (08/25): 표가 데이터를 숨기지 않는다
    api<ClaimsTable>("/claims/table?limit=0").then(setTable).catch(() => {});
  }, []);
  useEffect(() => { refreshStrip(); }, [refreshStrip]);

  // 연속 처리가 끝나면 문서 목록·현재 문서의 claim을 다시 읽는다 (숫자가 실제로 움직였음을 보인다)
  const afterRun = useCallback(() => {
    refreshStrip();
    api<DocRow[]>("/documents").then((d) => {
      setDocs([...d].sort((a, b) => b.interactionCount - a.interactionCount));
    }).catch(() => {});
  }, [refreshStrip]);

  useEffect(() => {
    api<{ agents: Agent[] }>("/system/agents").then((d) => setAgents(d.agents)).catch(() => {});
  }, []);

  // ⓪ 데이터 로드 — 자동이 아니라 버튼으로: "읽었더니 몇 건이 인식됐다"가 화면의 사건이 되게 한다
  const loadData = useCallback(async () => {
    // 목록 조회만 하면 "원본에서 시작한다"의 증거가 없다 — 원본 전건을 실제로 파싱해
    // DB 원문과 대조한다 (320건 약 1초, 결정론이라 반복해도 같은 답·비용 0)
    const [d, scanned, blocks] = await Promise.all([
      api<DocRow[]>("/documents"),
      api<ParseScan>("/system/parse-scan", { method: "POST" }).catch(() => null),
      api<BlockLedger>("/documents/blocks").catch(() => null),
    ]);
    setLedger(blocks);
    // 의료진이 여럿 담긴 문서를 앞에 — 귀속이 하는 일이 한눈에 보인다
    const sorted = [...d].sort((a, b) => b.interactionCount - a.interactionCount);
    setDocs(sorted);
    setScan(scanned);
    if (sorted[0]) setDocId(sorted[0].id);
    setDocsLoaded(true);
    refreshStrip();
    try { localStorage.setItem("delphi:pipeline:parsed", "1"); } catch { /* 사파리 프라이빗 등 */ }
  }, [refreshStrip]);

  // 새로고침 복원 — 눌렀던 적이 있으면 같은 조회를 조용히 다시 한다(결정론·비용 0).
  // 영수증 문구만 "방금"이 아니라 "이미"로 바뀐다 — 안 한 일을 했다고 하지 않는다.
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    let mark = null as string | null;
    try { mark = localStorage.getItem("delphi:pipeline:parsed"); } catch { /* 접근 불가 */ }
    if (mark !== "1") return;
    setRestored(true);
    loadData().catch(() => { setRestored(false); });
  }, [loadData]);

  // 전체 분할 독해 — 정찰 조각들이 차오르고 종합 설계자가 판정하는 백그라운드 잡
  const [full, setFull] = useState<FullScan | null>(null);
  // 0 = 전체 코퍼스. 기본을 전체로 둔다 — 표본으로 뽑은 스키마는 "이 데이터에서 나온 스키마"가
  // 아니라 "이 40건에서 나온 스키마"라서 근거로 쓸 수 없다 (08/24). 리허설은 파이프라인 점검용.
  const [scanScope, setScanScope] = useState(0);
  const [fullPolling, setFullPolling] = useState(false);
  const [fullLog, setFullLog] = useState<FullScan["events"]>([]);
  const fullSeq = useRef(0);
  const fullLogBox = useRef<HTMLDivElement>(null);

  const adoptCheckedFields = async () => {
    if (!proposal) return;
    const targets = proposal.fields.filter(
      (f) => fieldChecked.has(f.key) && !f.alreadyInContract && !fieldDecisions[f.key]);
    for (const f of targets) {
      await adoptField(f);   // 채택 API는 중복 안전(멱등) — 순차 호출로 충분
    }
    setFieldChecked(new Set());
  };

  // SCP 큐 (08/25) — 채택된 제안을 Steward(=콘솔 사용자)가 여기서 심사한다.
  // 승인하면 그 자리에서 새 버전이 만들어져 활성화 — 구조 루프가 닫히는 지점.
  type ScpRow = { id: number; kind: string; targetField: string; proposedValue: string;
                  rationaleKo: string; status: string };
  const [scpRows, setScpRows] = useState<ScpRow[]>([]);
  const refreshScp = useCallback(() => {
    api<ScpRow[]>("/contract/proposals", { role: "DATA_STEWARD" }).then(setScpRows).catch(() => {});
  }, []);
  useEffect(() => { refreshScp(); }, [refreshScp]);

  // 계약 확정 상태 (08/25) — 확정은 앱에서 사람이 수행한다. 확정 전엔 추출·폼이 잠긴다
  type ContractSt = { version: string | null; status: string; approvedBy: string | null;
                      approvedAt: string | null; locked?: boolean };
  const [contractSt, setContractSt] = useState<ContractSt | null>(null);
  const refreshContract = useCallback(() => {
    api<ContractSt>("/contract/status").then(setContractSt).catch(() => {});
  }, []);
  useEffect(() => { refreshContract(); }, [refreshContract]);
  const confirmContract = async () => {
    if (!contractSt?.version) return;   // 초안이 있어야 확정한다 (버전은 서버가 정한다)
    await api(`/contract/versions/${contractSt.version}/activate`,
              { method: "POST", role: "DATA_STEWARD" });
    refreshContract();
  };
  const contractActive = contractSt?.status === "ACTIVE";
  // 계약 동결 (08/27) — 버튼을 눌러서 423을 받고 아는 것보다, 먼저 말해 주는 편이 낫다
  const contractNone = contractSt?.status === "NONE";   // 공장 초기화 후 — 부트스트랩 모드 (08/25)

  // 첫 버전(v1.0) 초안 조립 (08/25) — 채택된 필드를 모아 DRAFT를 만든다. 포함 여부는 사람의
  // 채택이, 상세 사양은 08/19 정본이 정한다 (서버 assemble이 그 규칙의 실물).
  // 조립 = yaml 생성 (08/26 재설계 — "승인하면 yaml이 생겨서 DB 설계가 들어간다").
  // 이름·라벨·허용값은 채택된 AI 제안 그대로이고, 여기서 사람이 확정하는 것은
  // 포함/보류 · 분석 축(환자군·신호) 지정 · 허가범위 밖 값 · 가설 임계 대상 신호다.
  type PlanItem = { id: number; key: string; labelKo: string; rationaleKo: string;
                    occurrenceCount: number; values: { value: string; labelKo: string }[] };
  type Decision = { include: boolean; axis: "segment" | "signal" | null;
                    outOfLabelValues: string[]; autoSignalValues: string[] };
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [assembleNote, setAssembleNote] = useState<string | null>(null);
  const [assembleErr, setAssembleErr] = useState<string | null>(null);
  const loadPlan = useCallback(() => {
    api<{ adopted: PlanItem[]; suggestedAxes: { segment: string | null; signal: string | null } }>(
      "/contract/assemble-plan", { role: "DATA_STEWARD" })
      .then((pl) => {
        setPlan(pl.adopted);
        setDecisions((prev) => {
          const next: Record<string, Decision> = {};
          for (const a of pl.adopted) {
            next[a.key] = prev[a.key] ?? {
              include: true,
              axis: pl.suggestedAxes.segment === a.key ? "segment"
                : pl.suggestedAxes.signal === a.key ? "signal" : null,
              outOfLabelValues: [], autoSignalValues: [],
            };
          }
          return next;
        });
      }).catch(() => {});
  }, []);
  useEffect(() => {
    if (contractNone) loadPlan();
  }, [contractNone, scpRows.length, loadPlan]);

  // ① 의 세 걸음 상태 — **데이터가 정한다**. 어디까지 왔는지는 화면이 판단할 몫이지
  // 사람이 골라야 할 것이 아니다 (08/26).
  //   a 읽는다   원본 로드 전 대기 → 제안이 오면 완료
  //   b 고른다   제안이 와야 시작 → v1.0 초안이 생기면 완료
  //   c 확정한다 고를 것이 준비되면 시작 → ACTIVE면 완료
  const stepA: SubStepState = proposal ? "done" : docsLoaded ? "active" : "wait";
  const stepB: SubStepState = !contractNone ? "done" : proposal ? "active" : "wait";
  const stepC: SubStepState = contractActive ? "done"
    : (!contractNone || (plan !== null && plan.length > 0)) ? "active" : "wait";

  // 되돌릴 수 없는 행위는 확인을 받는다 (08/27) — SCP 승인은 누르는 즉시 새 계약
  // 버전이 활성화되고, 그 뒤 판독하는 값부터 새 스키마를 따른다.

  const setDecision = (key: string, patch: Partial<Decision>) =>
    setDecisions((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

  // 축 지정은 **라디오 의미**다 (08/26 — 실사고: 12개를 전부 신호축으로 고를 수 있었다).
  // 새로 지정하면 같은 축을 쓰던 필드는 자동으로 일반 필드로 내려온다 — 규칙을 화면이
  // 강제하므로 서버 409를 읽고서야 규칙을 알게 되는 일이 없다.
  const setAxis = (key: string, axis: Decision["axis"]) =>
    setDecisions((d) => {
      const next: Record<string, Decision> = {};
      for (const [k, v] of Object.entries(d)) {
        next[k] = k === key ? { ...v, axis }
          : axis && v.axis === axis ? { ...v, axis: null } : v;
      }
      return next;
    });

  // 지금 지정 상태 — 버튼을 누르기 전에 화면이 먼저 말한다
  const axisOf = (a: "segment" | "signal") =>
    Object.entries(decisions).find(([, d]) => d.include && d.axis === a)?.[0] ?? null;
  const segKey = axisOf("segment");
  const sigKey = axisOf("signal");
  const blockReason = !segKey ? "환자군 축을 1개 지정하세요"

    : null;
  const toggleIn = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const assembleDraft = async () => {
    setAssembleErr(null);
    try {
      const body = { decisions: (plan ?? []).map((a) => ({ key: a.key, ...decisions[a.key] })) };
      const out = await api<{ matched: string[]; deferred: string[]; version: string;
                              axes: { segment: string; signal: string }; autoSignals: string[] }>(
        "/contract/assemble", { method: "POST", role: "DATA_STEWARD", body: JSON.stringify(body) });
      setAssembleNote(
        `v${out.version} yaml 생성됨 — 필드 ${out.matched.length}개 (환자군 축 ${out.axes.segment} · ` +
        `신호 축 ${out.axes.signal} · 임계 대상 ${out.autoSignals.length}개)` +
        (out.deferred.length ? ` · 보류 ${out.deferred.length}개 → 확정 후 스키마 변경 심사로` : ""));
      refreshContract(); refreshScp();
    } catch (e) {
      // 오류는 배너 안에 — 페이지 맨 위에만 뜨면 "버튼이 안 눌린다"로 보인다 (08/25 실사고)
      setAssembleErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    }
  };

  // AI Readable 테이블의 컬럼 = 활성 스키마 (08/25) — 스키마가 자라면 컬럼이 자란다.
  // values는 enum 라벨 툴팁용 — 셀의 값은 DB 코드 그대로 두고(실물 원칙), 뜻은 툴팁으로 잇는다.
  type ActiveFields = Record<string, { labelKo: string;
                                       values?: { value: string; labelKo: string }[] | null }>;
  const [activeFields, setActiveFields] = useState<ActiveFields | null>(null);
  const [axes, setAxes] = useState<{ segment: string; signal: string } | null>(null);
  // enum 코드 → 확정 스키마의 한국어 라벨 (없으면 코드 그대로 — 지어내지 않는다)
  const enumLabel = (field: string, code: string) =>
    activeFields?.[field]?.values?.find((v) => v.value === code)?.labelKo ?? code;
  useEffect(() => {
    if (contractActive) {
      api<{ fields: ActiveFields; axes?: { segment: string; signal: string } }>("/contract/active")
        .then((c) => { setActiveFields(c.fields); setAxes(c.axes ?? null); }).catch(() => {});
    } else {
      setActiveFields(null);
      setAxes(null);
    }
  }, [contractActive, contractSt?.version]);
  const camel = (k: string) => k.split("_").map((w, i) => i ? w[0].toUpperCase() + w.slice(1) : w).join("");

  // 스키마 제안 심사 (08/25) — 신규 항목을 SCP 큐에 올리는 사람의 행위
  const [fieldDecisions, setFieldDecisions] = useState<Record<string, "QUEUED" | "HELD">>({});
  const [fieldChecked, setFieldChecked] = useState<Set<string>>(new Set());
  const toggleField = (key: string) => setFieldChecked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const adoptField = async (f: Proposal["fields"][number]) => {
    const out = await api<{ id: number; alreadyExisted: boolean }>("/contract/proposals", {
      method: "POST", role: "DATA_STEWARD",
      body: JSON.stringify({
        kind: "NEW_FIELD", targetField: f.key, proposedValue: f.labelKo,
        rationaleKo: f.rationaleKo, occurrenceCount: f.observedInDocs,
        impactNoteKo: "분할 독해 부트스트랩 제안에서 사람이 채택",
        // 승인 시 새 버전 YAML을 만들 재료 — 라벨·enum 값까지 함께 보존 (08/25)
        fieldSpec: { labelKo: f.labelKo, kind: f.kind,
                     values: f.values.map((v) => ({ value: v.value, labelKo: v.labelKo })) },
      }),
    });
    setFieldDecisions((prev) => ({ ...prev, [f.key]: "QUEUED" }));
    refreshScp();
    return out;
  };

  // 일괄 심사 (08/25) — 체크박스로 고른 여러 건을 한 번에. 건별 결과는 서버가 감사로 남긴다
  const [vocabChecked, setVocabChecked] = useState<Set<number>>(new Set());

  const startFullScan = async () => {
    setErr(null);
    try {
      const out = await api<{ started: boolean; messageKo?: string }>(
        `/contract/propose-full?chunkSize=20&maxDocs=${scanScope}`,
        { method: "POST", role: "DATA_STEWARD" });
      if (!out.started) { setErr(out.messageKo ?? "시작할 수 없습니다."); return; }
      fullSeq.current = 0;
      setFullLog([]);
      setFullPolling(true);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    }
  };

  // 중지 — 서버에서 도는 잡이라 새로고침·창닫기로는 안 멈춘다. 서버에 중지를 요청한다 (08/25)
  const [fullStopping, setFullStopping] = useState(false);
  const stopFullScan = async () => {
    setFullStopping(true);
    try {
      await api<{ stopped: boolean; messageKo: string }>(
        "/contract/propose-full/stop", { method: "POST", role: "DATA_STEWARD" });
    } catch { /* 이미 끝났으면 무해 */ }
  };

  useEffect(() => {
    if (!fullPolling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await api<FullScan>(`/contract/propose-full?after=${fullSeq.current}`,
          { role: "DATA_STEWARD" });
        if (cancelled) return;
        if (s.events.length) {
          fullSeq.current = s.lastSeq;
          setFullLog((prev) => [...prev, ...s.events].slice(-400));
        }
        setFull(s);
        if (!s.running) {
          setFullPolling(false);
          setFullStopping(false);
          if (s.result) setProposal(s.result);
          // 08/28: 용어 수확분 조회를 뺐다 — 심사는 Data Contract / 온톨로지가 한다
          if (s.phase === "ABORTED" && s.events.length) {
            setErr(s.events[s.events.length - 1].messageKo);
          }
        }
      } catch { /* 다음 틱에 재시도 */ }
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => { cancelled = true; clearInterval(t); };
  }, [fullPolling]);

  // 새로고침해도 서버에서 도는 잡에 다시 붙는다 — 화면 상태가 아니라 서버가 진실이다
  useEffect(() => {
    api<FullScan>("/contract/propose-full?after=0", { role: "DATA_STEWARD" })
      .then((s) => {
        if (s.phase === "IDLE") return;
        setFull(s);
        setFullLog(s.events);
        fullSeq.current = s.lastSeq;
        if (s.result) setProposal(s.result);
        if (s.running) setFullPolling(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fullLogBox.current?.scrollTo({ top: fullLogBox.current.scrollHeight });
  }, [fullLog]);

  const fullRunning = fullPolling || (full?.running ?? false);

  // 08/28: 호출 기록 폴링을 뺐다 — 기록은 실행 기록(AUDIT) 화면이 자기 데이터로 읽는다

  // 원문 열기 — 원장 표에서 고른 문서의 원본을 그 자리에서 파싱해 적재본과 대조한다
  // (08/24 개정: 무작위 열기 → 표에서 행 클릭. 무엇을 여는지 사람이 고르는 게 직관적이다)
  const [peekSrc, setPeekSrc] = useState<SourceCheck | null>(null);  // 확대경의 원본 파싱 대조
  const [magErr, setMagErr] = useState<string | null>(null);         // 확대경 안 인라인 오류
  // ②의 결과가 서버 저장본에서 온 시각 (08/25) — 있으면 모델을 다시 돌릴 이유가 없다
  const [attrAsOf, setAttrAsOf] = useState<string | null>(null);
  // 카드 ↔ 원문 연결 (08/25) — 카드를 클릭하면 왼쪽 원문의 근거 문장으로 스크롤·강조
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const focusClaim = (id: string) => {
    setActiveClaimId(id);
    setTimeout(() => document.getElementById(`cmark-${id}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  };

  // 인식 요약 — 서버가 준 행을 그대로 세는 결정론 표시 로직 (LLM 무관)
  const dataSummary = useMemo(() => {
    if (!docs.length) return null;
    const count = (key: (d: DocRow) => string | null) => {
      const m: Record<string, number> = {};
      for (const d of docs) { const k = key(d) ?? "?"; m[k] = (m[k] ?? 0) + 1; }
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const dates = docs.map((d) => d.occurredOn).filter(Boolean).sort();
    return {
      blocks: docs.reduce((n, d) => n + d.interactionCount, 0),
      formats: count((d) => d.sourceFormat),
      langs: count((d) => d.language),
      period: dates.length
        ? `${dates[0]?.slice(0, 7)} ~ ${dates[dates.length - 1]?.slice(0, 7)}`
        : "—",
    };
  }, [docs]);

  const loadDoc = useCallback(async (id: string) => {
    setAttr(null); setAttrAsOf(null); setExtract(null); setClaims([]); setErr(null); setMagErr(null);
    // 전부 저장된 것을 읽는 조회다 — 여기서 모델이 도는 일은 없다 (08/25).
    // 추출 결과는 claims 행에서, ② 검증 결과는 attribution_results 저장본에서 온다.
    const [detail, src, cl, storedAttr] = await Promise.all([
      api<DocDetail>(`/documents/${id}`),
      api<SourceCheck>(`/documents/${id}/source`).catch(() => null),
      api<Claim[]>(`/claims?documentId=${id}`).catch(() => []),
      api<StoredAttribution>(`/documents/${id}/attribution`).catch(() => null),
    ]);
    setDetail(detail); setPeekSrc(src); setClaims(cl);
    if (storedAttr?.available && storedAttr.result) {
      setAttr(storedAttr.result);
      setAttrAsOf(storedAttr.asOf);
    }
  }, []);

  // 표에서 행을 클릭하면 확대경으로 — 셀렉트박스 대신 표가 진입점이다 (08/25).
  // 스크롤은 문서가 실제로 로드된 뒤에 — 로드 전 스크롤은 재렌더에 밀려 무시된다.
  const jumpPending = useRef(false);
  const jumpToDoc = useCallback((id: string) => {
    jumpPending.current = true;
    setDocId(id);
  }, []);
  useEffect(() => {
    if (detail && jumpPending.current) {
      jumpPending.current = false;
      // scrollIntoView가 React 커밋 직후엔 무시되는 현상(08/25 실측) — 창 좌표로 직접 이동
      const go = () => {
        const el = document.getElementById("magnifier");
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 8 });
      };
      requestAnimationFrame(go);
      setTimeout(go, 300);
    }
  }, [detail]);

  useEffect(() => { if (docId) loadDoc(docId).catch((e) => setErr(e.message)); }, [docId, loadDoc]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setErr(null);
    try { await fn(); }
    catch (e) { setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e)); }
    finally { setBusy(null); }
  };

  // ③ 추출 실행 — 기본은 force 없음(이미 추출된 문서는 서버가 건너뜀). force는 용어 승인 후
  // 재평가 전용이고, 승인·기각된 claim이 있으면 서버가 409로 거부한다 (사람 결정 보존).
  const runExtract = (force: boolean) => {
    setMagErr(null);
    run("extract", async () => {
      try {
        const out = await api<Extraction>(
          `/documents/${docId}/extract${force ? "?force=true" : ""}`, { method: "POST" });
        setExtract(out);
        setClaims(await api<Claim[]>(`/claims?documentId=${docId}`).catch(() => []));
        refreshStrip();   // 방금 저장된 행이 AI Readable 표·결과 계기판에 바로 반영되게
      } catch (e) { setMagErr(`추출 실패 — ${e instanceof Error ? e.message : String(e)}`); }
    });
  };

  return (
    <>
      <Topbar
        title="AI Readable 전환"
      />

      <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <Eyebrow>SENSE</Eyebrow>
        <h1 className="mt-2 text-[1.5rem] font-bold leading-[1.25] tracking-tight text-navy">
          비정형 데이터가 의미 단위가 되는 곳
        </h1>
        {/* 08/28: 리드를 1문장으로. ⓪①② 순서 안내를 문장으로 쓰고 있었는데,
            각 단계 카드에 번호가 이미 붙어 있어 구조가 순서를 말한다. 그리고 판단·계산의
            분담(에이전트/서버)은 화면 전체에 걸린 규칙이라 화면마다 반복할 필요가 없다. */}
        {/* 08/28: 뒤 반 문장을 더했다. SK에서 AI Readable 이 화두라 심사위원이 이 화면을
            면밀히 보는데, 화면이 **과정**만 말하고 그 말이 무엇인지는 말하지 않았다 —
            정의는 docs/08 §2.1 에만 있었다. 별도 패널을 얹지 않고 리드 한 줄로 답한다
            (화면의 정체성은 ⓪①② 과정이고, 그 프레임을 바꾸지 않는다). */}
        <p className="mt-1.5 max-w-[76ch] text-[0.9375rem] leading-[1.7] text-body">
          원본을 그대로 읽고, 그 데이터에서 스키마를 뽑아 사람이 확정한 뒤, 그 스키마로 구조화합니다 —
          값에 <b className="text-ink">스키마·근거 위치·목적·언어 코드·승인 상태</b> 다섯 가지가 붙어야
          AI Readable 입니다.
        </p>
        {/* 08/30: 화면이 «무엇을 하는 곳인가»만 말하고 **지금 상태**는 맨 아래 실행
            결과에서만 말했다 — 라인을 한 번도 안 돌린 세션에서 화면이 통째로 «아직
            아무것도 없습니다»로 읽혔다. 홈·신호의 여정과 같은 헤어라인 재질로 현황을
            먼저 놓는다. 숫자는 이미 받아 둔 `/aggregates/pipeline` 값 그대로다. */}
        <LineStatus strip={strip} contractVersion={contractSt?.version ?? null} />
        <ProductStrip />
      </header>

      {err && (
        <Panel tone="note" pad="md" className="text-[0.9375rem] leading-[1.7] text-rust">
          {err}
        </Panel>
      )}

      {/* ── 큰 묶음: 비정형 데이터 → AI Readable 데이터 전환 (08/26 재구성) ──
          ⓪ 원본 인식과 ① 스키마 확정은 "읽을 수 있게 만드는" 한 덩어리다. */}
      {/* 08/28: ⓪·① 을 감싸던 연보라 묶음 패널을 없앴다.
          ① 카드 안에 카드가 되어 같은 라인의 ②(LiveRunner)와 층이 달랐고,
          ② 이 화면의 주석 자신이 "⓪→①→② 라인을 한 번 걸어가는 자리"라고 쓰는데
             래퍼는 ⓪① 만 묶어 **화면이 말하는 선과 다른 경계**를 긋고 있었다.
          ③ 배경색 박스 안에 흰 박스들은 도면(docs/05) 룩이 아니라 슬라이드 룩이다.
          순서는 번호(Step 0·1·2)가 이미 말한다 — 테두리를 하나 지운다.
          08/30: 배지 안 글자를 ⓪①② → 0·1·2 로 바꿨다. Step 이 이미 **원형** 배지라
          원 문자를 넣으면 원 안에 원이 된다(팀장 지적). 하위 단계가 a·b·c 평문인 것과도
          어긋났다. 화면 본문의 «⓪에서 …» 문구도 «0단계에서 …» 로 같이 맞췄다. */}

      {/* ── ⓪ 데이터 로드 — 에이전트가 아니라 결정론 코드 ─────────────────── */}
      {/* 08/28: 손으로 짠 마크업을 Stage 로 옮겼다. 같은 라인의 세 걸음 중 ⓪만
          제목 16px·사각 번호였고 1·2 는 17px·원형 Step 이었다 — 이제 셋이 한 컴포넌트다. */}
      {/* 08/30 팀장: 이 단계를 «원본과 문자 단위로 대조» 로 설명하고 있었는데 주객이
          바뀐 문구다. 대조는 **나눈 결과가 맞는지 확인하는 부분**이고, 이 단계가 실제로
          만드는 것은 **블록 경계**(doc_char_start·block_index)다 — 즉 문서를
          «의료진 한 사람의 코멘트» 단위로 나누는 일이다. «파싱» 이라는 말도 쓰지 않는다
          (팀장: 어려우니 «나눈다» 로). */}
      <Stage
        n="0" title="원본 분해 — 문서를 의료진 코멘트 단위로"
        busy={busy === "load"} onRun={() => run("load", loadData)}
        runLabel={docsLoaded ? "다시 나누기" : "원본 불러오기"} busyLabel="나누는 중…"
        runTitle="docx·pdf를 열어 의료진 코멘트 단위로 나눕니다. 모델을 부르지 않아 몇 번 눌러도 비용이 없습니다"
        badge={
          <span title="규칙 기반 처리 — 모델을 부르지 않습니다. 몇 번 눌러도 같은 답이고 비용도 없습니다"
                className="inline-flex items-center gap-1 rounded-full bg-green-soft px-2 py-0.5 text-[0.75rem] font-bold text-green">
            {/* 08/30 팀장: «0원» 을 뺐다. 비용은 개발·운영 관심사이고 이 화면에
                「비용 구조」·「재실행 · 비용」 접힘이 이미 있어 세 번 말하고 있었다 —
                그러면 제품이 «돈 아끼는 도구»로 읽힌다. 남길 값어치가 있는 것은
                **이 단계가 AI 해석이 아니라는 사실**(절대 규칙 #1·#8)이라 그것만 말한다. */}
            <span aria-hidden>⚙️</span>AI 판단 없음
          </span>
        }
        note={
          <>
            {/* 08/28: 설명 5줄을 1줄 + 접힘으로. 정보를 버리지 않고 자리를 옮겼다 —
                운영자에게 필요한 내용이고 심사위원에게는 첫 화면에서 필요하지 않다. */}
            <p className="mt-2.5 text-xs text-muted">
              워드·PDF 원본을 열어 <b className="text-ink">의료진 한 사람의 코멘트 단위</b>로 나눕니다.
              나눈 조각이 원문과 글자 하나까지 같은지 함께 확인합니다.
            </p>
            <details className="group mt-1.5">
              <summary className="mono inline-flex cursor-pointer list-none items-center gap-1.5 text-[0.75rem] text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange">
                <span aria-hidden>▶</span>재실행 · 비용
              </summary>
              <p className="mt-2 max-w-[70ch] text-xs leading-[1.7] text-muted">
                이 단계는 에이전트가 아니라 <b className="text-ink">규칙 기반 처리(OCR·LLM 아님)</b>라
                몇 번을 눌러도 같은 답이고 비용이 없습니다. 걸린 시간까지 아래에 그대로 띄우므로
                &ldquo;읽었다&rdquo;가 주장이 아니라 측정값입니다. 누가 말했는지 가르는 판단은 아래 <b className="text-ink">귀속 검증</b>의 몫입니다.
              </p>
            </details>
          </>
        }
      >
        {!docsLoaded ? (
          <p className="mt-4 text-sm text-muted">
            아직 읽지 않았습니다 — <b className="text-ink">[원본 불러오기]</b>를 누르면 시작됩니다.
          </p>
        ) : (
          dataSummary && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-ink">
                <b className="text-navy">비정형 데이터 {docs.length.toLocaleString()}건 인식</b>
                {" — "}의료진 발언 블록 {dataSummary.blocks.toLocaleString()}개
              </p>

              {/* 전건 파싱 실측 — "정말 파싱한 거냐"에 대한 답: 시간과 대조 결과를 그대로 (08/24) */}
              {scan && (
                <div className="rounded-xl border border-glass-line bg-card px-3.5 py-2.5 text-[0.8125rem]">
                  <p className="text-ink">
                    <b className="text-navy">
                      {restored ? "원본" : "방금 원본"} {scan.parsedDocuments.toLocaleString()}건
                      {restored ? "이 나뉘어 있습니다" : "을 나눴습니다"}
                    </b>
                    {" — "}
                    {Object.entries(scan.byFormat).map(([k, v]) => `${k} ${v}`).join(" · ")}
                    {" · "}{scan.parsedChars.toLocaleString()}자
                    {" · "}<b className="text-orange">{(scan.elapsedMs / 1000).toFixed(2)}초</b>
                  </p>
                  <p className="mt-1 text-muted">
                    DB 원문과 대조:{" "}
                    {scan.mismatched.length === 0 && scan.missing.length === 0 ? (
                      <b className="text-orange">{scan.matched.toLocaleString()}건 전건 문자 단위 일치</b>
                    ) : (
                      <b className="text-rust">
                        일치 {scan.matched} · 불일치 {scan.mismatched.length} · 원본 없음 {scan.missing.length}
                        {scan.mismatched[0] && ` (예: ${scan.mismatched[0].filename})`}
                      </b>
                    )}
                    {" · "}{scan.engine}
                  </p>
                  {/* 의료진 블록 분리 — 파싱 텍스트에서 도출한 값 (시드 복사가 아니다) */}
                  {scan.doctorSplit && (
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="text-ink">
                        읽어 들인 텍스트의 의료진 헤딩 구조에서{" "}
                        <b className="text-navy">발언 블록 {scan.doctorSplit.derivedBlocks.toLocaleString()}개
                        · 의료진 {scan.doctorSplit.distinctSurfaces}명(이름 기준)</b>을 분리 —{" "}
                        {scan.doctorSplit.docsMismatched.length === 0 ? (
                          <b className="text-orange">수집 기록과 시작 오프셋까지 전건 일치</b>
                        ) : (
                          <b className="text-rust">불일치 {scan.doctorSplit.docsMismatched.length}건
                            (예: {scan.doctorSplit.docsMismatched[0]})</b>
                        )}
                      </p>
                      {/* 의사별 정리 표 — 파싱에서 도출한 집계 그대로, 전체 스크롤 */}
                      <div className="mt-1.5 max-h-56 overflow-auto rounded-lg border border-glass-line bg-card">
                        <table className="w-full text-left text-[0.75rem]">
                          <thead className="sticky top-0 bg-on-navy-3 backdrop-blur-sm">
                            <tr>
                              <th className={TH}>#</th>
                              <th className={TH}>의료진 (이름 기준)</th>
                              <th className={TH}>발언 블록</th>
                              <th className={TH}>등장 문서</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scan.doctorSplit.doctors.map((t, i) => (
                              <tr key={t.surface} className="">
                                <td className="px-2 py-1 text-muted">{i + 1}</td>
                                <td className="px-2 py-1 font-bold text-ink">{t.surface}</td>
                                <td className="px-2 py-1 text-navy">{t.blocks}</td>
                                <td className="px-2 py-1 text-muted">{t.docs}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-1 text-[0.75rem] text-muted">
                        {scan.doctorSplit.methodKo} · 경계가 명시되지 않은 실데이터에서는 AI 귀속자가 이 자리를 맡습니다
                      </p>
                    </div>
                  )}

                  {/* 원석 블록 원장 — 파싱·분리 결과가 적재된 SQL 테이블(interactions)의 raw 표 */}
                  {ledger && ledger.rows.length > 0 && (
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="text-ink">
                        <b className="text-navy">SQL 적재본 — 원석 블록 원장 {ledger.total.toLocaleString()}행</b>
                        <span className="text-muted"> (interactions 테이블 그 자체 · 시작 오프셋은 위에서 나눈 값과
                        전건 대조됨 · 아직 구조화 전 — 스키마대로 값을 뽑는 것은 다음 단계)</span>
                        <br />
                        <span className="text-muted">아래 <b className="text-ink">행을 클릭</b>하면 페이지 하단
                        <b className="text-ink"> 원문 확대경</b>에서 그 문서의 원문·의료진 구간·추출 결과를 한 화면으로 봅니다.</span>
                      </p>
                      <div className="mt-1.5 max-h-72 overflow-auto rounded-lg border border-glass-line bg-card">
                        <table className="w-full min-w-[980px] text-left text-[0.75rem]">
                          <thead className="sticky top-0 bg-on-navy-3 backdrop-blur-sm">
                            <tr>
                              {["문서", "원본 파일", "포맷", "발생일", "의료진", "전문분야", "지역", "블록", "문자 범위", "원문 미리보기"].map((h) => (
                                <th key={h} className={TH}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ledger.rows.map((r, i) => (
                              <tr key={`${r.documentId}-${r.blockIndex ?? 0}-${i}`}
                                  onClick={() => jumpToDoc(r.documentId)}
                                  title="클릭 — 아래 원문 확대경에서 이 문서를 연다"
                                  className={`cursor-pointer align-top hover:bg-fill-1 ${
                                    docId === r.documentId ? "bg-orange-soft" : ""}`}>
                                <td className="whitespace-nowrap px-2 py-1"><code className="text-navy">{r.documentId}</code></td>
                                <td className="whitespace-nowrap px-2 py-1 text-muted">{r.filename}</td>
                                <td className="whitespace-nowrap px-2 py-1 text-muted">{r.sourceFormat}</td>
                                <td className="whitespace-nowrap px-2 py-1 text-muted">{r.occurredOn ?? "—"}</td>
                                <td className="whitespace-nowrap px-2 py-1 font-bold text-ink">{r.hcpRef}</td>
                                <td className="whitespace-nowrap px-2 py-1 text-muted">{r.hcpSpecialty ?? "—"}</td>
                                <td className="whitespace-nowrap px-2 py-1 text-muted">{r.region ?? "—"}</td>
                                <td className="whitespace-nowrap px-2 py-1 text-muted">{r.blockIndex ?? 1}</td>
                                <td className="whitespace-nowrap px-2 py-1 text-muted">
                                  {r.charStart != null ? `${r.charStart}–${r.charEnd}` : "전문"}
                                </td>
                                <td className="max-w-[380px] px-2 py-1 text-ink">
                                  <span className="line-clamp-2">{r.preview}…</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 text-xs">
                {dataSummary.formats.map(([k, v]) => (
                  <span key={k} className="mono rounded-lg bg-fill-1 px-2 py-1 text-[0.8125rem] text-body">{k} {v}건</span>
                ))}
                {dataSummary.langs.map(([k, v]) => (
                  <span key={`l-${k}`} className="mono rounded-lg bg-fill-1 px-2 py-1 text-[0.8125rem] text-body">{k} {v}건</span>
                ))}
                <span className="mono rounded-lg bg-fill-1 px-2 py-1 text-[0.8125rem] text-body">기간 {dataSummary.period}</span>
              </div>
              <p className="text-xs text-muted">
                전부 아직 구조화 전 원문 그대로입니다 — 다음: 1단계에서 무엇을 뽑을지 스키마부터 제안받으세요.
              </p>

            </div>
          )
        )}
      </Stage>

      {/* ── ① Contract 설계자 ───────────────────────────────────────────── */}
      {/* 08/30 팀장: «AI 가 제안하지만 **진짜 중요한 스키마는 사람이 결정했다**» 를
          제목이 말하게 한다. 이전 «데이터에서 뽑아 사람이 확정» 은 사람의 몫을
          **마지막 도장**처럼 읽히게 했는데, 이 제품의 주장은 반대다 — 무엇을 셀지를
          사람이 **먼저** 쥐고(고정 헤더), 그 데이터에만 있는 것을 AI 가 찾는다(발견 헤더).
          CLAUDE.md 의 닫는 문장 그대로: «무엇을 셀지 정하지 않으면, 가장 좋은 신호도
          엉뚱한 칸에 들어간다». */}
      <Stage
        n="1" title="스키마 설계 — 제안은 AI가, 무엇을 셀지는 사람이" agent="Contract 설계자"
        model={agentOf("contract_architect")?.model ?? "—"}
        ready={!!agentOf("contract_architect")?.ready}
        busy={busy === "propose" || fullRunning} disabled={!docsLoaded}
        onRun={startFullScan} runLabel="전체 분할 독해 시작"
        spec={agentOf("contract_scout")}
      >
        {/* ── ① 을 세 걸음으로 (08/26 재구성) ──────────────────────────
            읽는다 → 고른다 → 확정한다. 이전에는 평평한 나열이었고 **순서가 거꾸로**여서,
            위에서 아래로 읽으면 재료(분할 독해)가 생기기 전에 고르라고 나왔다.
            끝난 걸음은 한 줄 영수증으로 접히고, 지금 할 걸음만 펼쳐진다. */}
        <div className="flex flex-col">

          <SubStep
            mark="a" title="분할 독해 — 정찰이 20건씩 나눠 읽기" state={stepA}
            receipt={proposal
              ? <>정찰 {proposal.scan?.chunks ?? "—"}조 · 후보 {proposal.scan?.scoutCandidates ?? "—"}건 수집 → 종합 설계자가 {proposal.fields.length}건 채택 · {proposal.rejected.length}건 제외</>
              : docsLoaded ? "아직 읽지 않았습니다 — 위 [전체 분할 독해 시작]을 누르세요"
                           : "0단계 원본 불러오기가 먼저입니다"}
          >
          {/* 기본 실행은 전체 분할 독해다. 표본 1회 호출은 경로 점검용으로만 남긴다 —
              표본에서 뽑은 스키마는 "이 데이터의 스키마"가 아니라 "그 표본의 스키마"다 (08/24). */}

          {/* 전체 분할 독해 — 정찰 20건×N조 → 종합 설계자 병합·판정 (모델은 카드 헤더에 표시) */}
          <div className="mb-3 rounded-lg border border-glass-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* 08/28: ⓪과 같은 처리 — 5줄을 1줄 + 접힘으로. 운영자에게 필요한 단서(캐시 0원,
                  리허설 범위의 용도)는 버리지 않고 자리를 옮긴다.
                  details 는 p 의 자손이 될 수 없어(hydration 오류) 형제로 두고,
                  둘을 div 로 묶어 이 flex 컨테이너의 자식 수를 2로 유지한다. */}
              <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                <b className="text-ink">전체 분할 독해</b> — 정찰이 20건씩 나눠 읽고, 종합 설계자가 병합·채택/제외를 판정합니다.
              </p>
              <details className="group mt-1.5">
                <summary className="mono inline-flex cursor-pointer list-none items-center gap-1.5 text-[0.75rem] text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange">
                  <span aria-hidden>▶</span>독해 범위와 비용
                </summary>
                <p className="mt-2 max-w-[70ch] text-xs leading-[1.7] text-muted">
                  표본에서 뽑은 스키마는 <b className="text-ink">그 표본의 스키마</b>일 뿐이므로 확정 결과는 전체로만 냅니다.
                  인용은 전체 코퍼스와 재대조됩니다. <b className="text-ink">같은 범위를 다시 실행하면 캐시 재생이라 0원</b>이고,
                  아래 리허설 범위는 파이프라인을 고친 뒤 경로만 확인할 때 씁니다.
                </p>
              </details>
              </div>
              <div className="flex items-center gap-2">
                <select value={scanScope} onChange={(e) => setScanScope(Number(e.target.value))}
                        disabled={fullRunning}
                        className="rounded-xl border border-glass-line bg-card px-2 py-1.5 text-xs"
                        aria-label="분할 독해 실행 범위">
                  <option value={0}>전체 (기본)</option>
                  <option value={120}>리허설 120건</option>
                  <option value={40}>경로 점검 40건</option>
                </select>
                {fullRunning && (
                  <Btn size="xs" className="!border-rust !text-rust" onClick={stopFullScan} disabled={fullStopping}>
                    {fullStopping ? "중지 중…" : "중지"}
                  </Btn>
                )}
              </div>
            </div>
            {fullRunning && (
              <p className="mt-1 text-[0.75rem] text-muted">
                이 작업은 <b className="text-ink">서버에서 도는 잡</b>입니다 — 새로고침·창닫기로는 멈추지 않고,
                다시 열면 진행 중인 잡에 자동으로 붙습니다. 멈추려면 [중지]를 누르세요 (진행 중인 조각을
                마치고 멈추며, 완료된 조각은 캐시에 남아 재실행 시 0원).
              </p>
            )}
            {full && full.totalChunks > 0 && full.phase !== "IDLE" && (
              <div className="mt-2 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1">
                  {Array.from({ length: full.totalChunks }, (_, i) => {
                    const done = i < full.chunksDone;
                    const current = fullRunning && full.phase === "SCOUT" && i === full.chunksDone;
                    return (
                      <span key={i} title={`정찰 ${i + 1}`}
                            className={`h-4 w-4 rounded-sm border border-line transition-colors duration-500
                                        ${done ? "bg-orange" : current ? "animate-pulse bg-orange-soft" : "bg-card"}`} />
                    );
                  })}
                  <span className="mx-1 text-line">→</span>
                  <span title="종합 설계"
                        className={`h-4 w-4 rotate-45 border transition-colors duration-500
                                    ${full.phase === "DONE" ? "border-green bg-green-soft"
                                      : full.phase === "MERGE" ? "animate-pulse border-line bg-orange-soft"
                                      : "border-line bg-card"}`} />
                  <span className="ml-2 text-[0.75rem] text-muted">
                    정찰 {full.chunksDone}/{full.totalChunks} · 후보 {full.candidateFields}건 · 인용 폐기 {full.droppedQuotes}
                    {full.phase === "MERGE" && " · 종합 판정 중…"}
                    {full.phase === "DONE" && " · 완료 — 아래 제안이 종합 결과입니다"}
                  </span>
                </div>
                {fullLog.length > 0 && (
                  <div ref={fullLogBox}
                       className="max-h-44 overflow-auto rounded-lg border border-glass-line bg-card p-2
                                  font-mono text-[0.75rem] leading-relaxed">
                    {fullLog.map((e) => (
                      <div key={e.seq} className="flex items-start gap-2 py-px">
                        <span className="shrink-0 text-muted">{hhmmss(e.ts)}</span>
                        <span className={`mt-px shrink-0 rounded px-1 text-[0.75rem] font-bold ${
                          e.kind === "MERGE" ? "bg-orange text-white"
                          : e.kind === "CHUNK" ? "bg-fill-2 text-body" : "bg-navy/90 text-on-navy"}`}>
                          {e.kind === "CHUNK" ? "정찰" : e.kind === "MERGE" ? "종합" : "런"}
                        </span>
                        <span className="text-ink">{e.messageKo}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* 보조 경로 — 표본 몇 건만 1회 호출해 파이프라인이 도는지 본다. 확정과 무관.
              08/28: 라벨에서 "개발용"·"배선"을 뺐다 — 심사위원이 보는 화면이고, 개발 용어는
              무엇을 하는 버튼인지 알려주지 않는다. 기능은 그대로다(08/24 결정: 표본 1회
              호출은 경로 점검용으로만 남긴다). */}
          <details className="mb-3 rounded-lg border border-glass-line bg-card px-3 py-2">
            <summary className="cursor-pointer text-xs font-bold text-muted">
              표본으로 경로 확인 — 표본 몇 건만 1회 호출합니다 (확정과 무관)
            </summary>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-muted">표본 수</span>
              <input
                type="number" min={3} max={40} value={proposeSample}
                onChange={(e) => setProposeSample(Math.max(3, Math.min(40, Number(e.target.value) || 3)))}
                disabled={fullRunning}
                className="w-14 rounded-xl border border-glass-line bg-card px-2 py-1.5 text-right text-xs"
                aria-label="표본 수"
              />
              <Btn size="xs"
                onClick={() => run("propose", async () => {
                  setProposal(await api<Proposal>(`/contract/propose?sampleSize=${proposeSample}`,
                    { method: "POST", role: "DATA_STEWARD" }));
                })}
                disabled={!docsLoaded || fullRunning || busy === "propose"}
              >
                표본 시험 실행
              </Btn>
              <span className="text-muted">— 표본 결과는 그 표본의 스키마일 뿐, 확정 근거가 아닙니다</span>
            </div>
          </details>
          {busy === "propose" && (
            <p className="mb-2.5 rounded-xl bg-fill-1 px-3.5 py-2.5 text-[0.875rem] leading-[1.7] text-body">
              모델이 표본 {proposeSample}건을 실제로 읽는 중… {busySec}초 경과 — 첫 실행은 1~2분 걸릴 수 있고,
              같은 표본 수로 다시 실행하면 캐시로 즉시 재생됩니다.
            </p>
          )}
          </SubStep>

          <SubStep
            mark="b" title="두 층 병합 — 고정 헤더 + 발견 헤더" state={stepB}
            /* 영수증이 **접혀 있어도** 두 층 주장을 말한다 (08/26).
               확정 뒤 이 걸음이 접히자 "회사가 아는 질문은 사람이 쥔다"는 주장이
               화면에서 통째로 사라졌다 — 이 제품이 파는 것이 그건데. */
            receipt={<>
              <b className="font-medium text-navy">고정 헤더</b>는 시장 확대를 위해 반드시 알아야 하는 것이라{" "}
              <b className="font-medium text-navy">사람이 도메인 지식으로 미리 정했고</b>,{" "}
              <b className="font-medium text-navy">발견 헤더</b>는 AI가 이 데이터에서만 찾습니다.
              {contractActive ? <> — v{contractSt?.version} 확정됨</>
                : !contractNone ? <> — v{contractSt?.version} 초안 생성됨</>
                : plan && plan.length > 0
                  ? <> — 발견 {plan.length}건 중 포함 {Object.values(decisions).filter((d) => d.include).length}건 · 환자군 축 {segKey ?? "미지정"}</>
                  : <> — 분할 독해가 끝나면 고를 항목이 생깁니다</>}
            </>}
          >
            {/* 고정 헤더는 **계약 상태와 무관하게 항상** 보여준다 (08/26).
                확정 뒤에 감췄더니 "시장 확대를 위해 반드시 알아야 하는 것은 사람이
                도메인 지식으로 미리 정했다"는 이 제품의 주장이 화면에서 사라졌다.
                확정 뒤에도 v1.0의 어느 부분이 사람의 층인지가 보여야 한다. */}
            <FixedHeaderPanel />
            {contractActive ? (
              <div className="mb-3 rounded-xl border border-green bg-green-soft p-3 text-xs">
                <b className="text-green">Contract v{contractSt?.version} 확정됨</b>{" "}
                <span className="text-ink">
                  — 승인 {contractSt?.approvedBy} · {contractSt?.approvedAt ? hhmmss(contractSt.approvedAt) : ""}.
                  이 버전이 개발 기준입니다: Field 폼·추출·집계가 전부 이걸 씁니다. 이후 변경은 스키마 변경 심사(SCP)로만.
                </span>
                <ActiveSchemaList />
                <ExternalTermsPanel />
              </div>
            ) : contractNone ? (
              <div className="text-xs">
              <div className="mb-3 rounded-xl border border-orange bg-rust-soft p-3">
              <p className="text-ink">
                <b className="text-rust">계약 없음 (v0.0) — 두 층으로 스키마를 세웁니다.</b>{" "}
                <b>고정 헤더</b>(위)는 시장 확대를 위해 반드시 알아야 하는 것이라 사람이 미리 정했고,
                <b> 발견 헤더</b>(아래 표)는 분할 독해가 이 코퍼스에서 찾은 것입니다.
                승인하면 그 자리에서 <b>v1.0 yaml이 생성</b>되고, 그것이 저장 구조·추출 스키마·집계를
                결정합니다. 여기서 <b>사람이 확정하는 것은 둘</b>입니다 —
                <b> 어떤 발견 항목을 채택할지</b>, 그리고 <b>환자군 축과 그 허가 범위 밖 값</b>.
                신호 축과 임계 대상은 고정 헤더가 이미 정합니다.
              </p>
              {plan && plan.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-glass-line bg-card px-3 py-2 text-[0.8125rem]">
                  <span className="font-bold text-navy">지금 지정 상태</span>
                  <span className={segKey ? "text-green" : "text-rust"}>
                    환자군 축: {segKey ? <><b>{segKey}</b> ✓</> : "미지정 ✗"}
                  </span>
                  <span className="text-line">·</span>
                  <span className="text-muted">신호 축·임계 대상은 고정 헤더가 정합니다</span>
                  <span className="ml-auto text-muted">환자군 축은 1개만 — 새로 고르면 이전 것이 일반 필드로 내려갑니다</span>
                </div>
              )}
              </div>
              {plan && plan.length > 0 && (
                <div className="mt-2 overflow-x-auto rounded-lg border border-glass-line bg-card">
                  <table className="w-full text-left text-[0.75rem]">
                    <thead className="">
                      <tr>
                        {["포함", "AI가 발견한 필드 — 이름·라벨 그대로 v1.0이 됨", "환자군 축", "허용값 — 체크는 사람의 판정"].map((h) => (
                          <th key={h} className={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plan.map((a) => {
                        const d = decisions[a.key];
                        if (!d) return null;
                        return (
                          <tr key={a.id} className={`align-top ${
                            d.include ? "" : "opacity-45"}`}>
                            <td className="px-2 py-1.5">
                              <input type="checkbox" checked={d.include}
                                     onChange={(e) => setDecision(a.key, { include: e.target.checked })} />
                            </td>
                            <td className="px-2 py-1.5" title={a.rationaleKo}>
                              <code className="font-bold text-navy">{a.key}</code>
                              <span className="ml-1 text-ink">{a.labelKo}</span>
                              <span className="ml-1 text-muted">· {a.occurrenceCount}회 관찰</span>
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5">
                              <select value={d.axis ?? ""} disabled={!d.include}
                                      onChange={(e) => setAxis(a.key, (e.target.value || null) as Decision["axis"])}
                                      className="mono rounded-lg border border-line bg-card px-1.5 py-0.5 text-[0.75rem]">
                                <option value="">일반 필드</option>
                                <option value="segment">환자군 축</option>

                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              {a.values.length === 0 ? (
                                <span className="italic text-muted">자유 텍스트</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {a.values.map((v) => (
                                    <span key={v.value}
                                          className="inline-flex items-center gap-1 rounded-md border border-glass-line bg-card px-1.5 py-0.5">
                                      <code className="text-navy">{v.value}</code>
                                      <span className="text-muted">{v.labelKo}</span>
                                      {d.axis === "segment" && (
                                        <label className="ml-0.5 inline-flex cursor-pointer items-center gap-0.5 text-[0.75rem] font-bold text-rust"
                                               title="허가 범위 밖 — 이 값의 신호는 Development로 분리됩니다. 판정은 사람의 행위입니다">
                                          <input type="checkbox"
                                                 checked={d.outOfLabelValues.includes(v.value)}
                                                 onChange={() => setDecision(a.key, {
                                                   outOfLabelValues: toggleIn(d.outOfLabelValues, v.value) })} />
                                          허가밖
                                        </label>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              </div>
            ) : (
              <p className="rounded-lg border border-line bg-card p-3 text-xs leading-[1.7] text-muted">
                v{contractSt?.version} 초안이 만들어져 고르는 단계는 끝났습니다 — 다시 짜려면{" "}
                <b className="text-ink">전체 초기화</b> 뒤 처음부터 진행하세요.
              </p>
            )}
          {!proposal ? (
            <p className="text-sm text-muted">
              {!docsLoaded && <b className="text-rust">먼저 0단계에서 원본을 나눠 주세요. </b>}
              비정형 데이터 표본 {proposeSample}건을 읽고 <b className="text-ink">무엇을 뽑을지</b>부터 제안합니다.
              활성 Contract는 변경되지 않습니다 — 채택은 사람(Data Steward)만 합니다.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StageStat label="표본 문서" value={proposal.sampledDocuments.length} />
                <StageStat label="제안 항목" value={proposal.fields.length} />
                <StageStat label="제외 항목" value={proposal.rejected.length} />
                <StageStat label="근거 폐기" value={proposal.droppedEvidence}
                      tone={proposal.droppedEvidence ? "warn" : "ok"} />
              </div>
              <p className="text-xs text-muted">{proposal.note_ko}</p>
              {contractNone && (
                <p className="rounded-lg bg-orange-soft px-3 py-2 text-xs leading-[1.7] text-ink">
                  <b>이 목록은 근거를 보는 자리입니다 — 결정은 위 조립 표에서 합니다.</b>{" "}
                  각 항목의 배지가 위에서 정한 결정(포함 · 환자군 축 · 보류)을 그대로 비춥니다.
                  아직 계약이 없으므로 &ldquo;변경 심사&rdquo;에 올릴 대상도 없습니다 — 심사는 v1.0이 확정된 뒤부터입니다.
                </p>
              )}
              {proposal.scan && (
                <p className="text-xs text-muted">
                  깔때기: 정찰 {proposal.scan.chunks}조 × {proposal.scan.chunkSize}건이 후보{" "}
                  <b className="text-ink">{proposal.scan.scoutCandidates}건</b> 수집 → 종합 설계자가{" "}
                  <b className="text-ink">{proposal.fields.length}건 채택 · {proposal.rejected.length}건 제외</b>
                </p>
              )}
              {/* 일괄 채택 바 (08/25) — 신규 항목만 대상, 현행 스키마 재확인·이미 처리된 것은 제외.
                  v0.0 부트스트랩에서는 숨긴다: 심사할 계약 자체가 아직 없다 (08/26) */}
              {!contractNone && proposal.fields.some((f) => !f.alreadyInContract && !fieldDecisions[f.key]) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Btn size="xs"  title="고른 항목을 스키마 변경 심사 큐에 올립니다. 승인해야 계약에 반영됩니다" onClick={() => {
                            const pending = proposal.fields
                              .filter((f) => !f.alreadyInContract && !fieldDecisions[f.key]).map((f) => f.key);
                            setFieldChecked(fieldChecked.size === pending.length ? new Set() : new Set(pending));
                          }}
                          >
                    신규 전체 {fieldChecked.size > 0 ? "해제" : "선택"}
                  </Btn>
                  <span className="text-muted">{fieldChecked.size}건 선택됨</span>
                  <Btn size="xs" variant="primary"  title="고른 항목을 스키마 변경 심사 큐에 올립니다. 승인해야 계약에 반영됩니다" onClick={() => adoptCheckedFields().catch((e) => setErr(e.message))}
                          disabled={fieldChecked.size === 0}
                          >
                    선택 항목 변경 심사에 올리기
                  </Btn>
                </div>
              )}
              <div className="space-y-2">
                {proposal.fields.map((f) => (
                  <div key={f.key} className="rounded-xl border border-glass-line bg-card p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {!f.alreadyInContract && !fieldDecisions[f.key] && (
                        <input type="checkbox" checked={fieldChecked.has(f.key)}
                               onChange={() => toggleField(f.key)} aria-label="일괄 채택 선택" />
                      )}
                      <code className="text-sm font-bold text-navy">{f.key}</code>
                      <span className="text-sm text-ink">{f.labelKo}</span>
                      <span className="mono rounded-lg bg-fill-1 px-2 py-0.5 text-[0.75rem] text-body">{f.kind}</span>
                      <span className="text-[0.75rem] text-muted">문서 {f.observedInDocs}건에서 관찰</span>
                      {/* 계약 없음(v0.0)에서는 **여기서 결정하지 않는다** (08/26).
                          결정하는 자리는 위 조립 표 하나뿐이다 — 같은 12건을 두 곳에서
                          서로 다른 질문으로 물어보면(포함? vs 변경 심사?) 답이 갈리고,
                          실제로 한 화면에서 같은 필드가 두 상태로 보였다.
                          이 목록은 그때 **근거를 보는 자리**로만 남는다. */}
                      {contractNone ? (
                        decisions[f.key] === undefined ? (
                          <span className="mono ml-auto rounded-lg bg-fill-1 px-2 py-0.5 text-[0.75rem] text-body"
                                title="아직 조립 표에 올라오지 않았습니다">미채택</span>
                        ) : !decisions[f.key].include ? (
                          <span className="mono ml-auto rounded-lg bg-fill-1 px-2 py-0.5 text-[0.75rem] text-body">
                            보류 — 위 조립 표에서 정함
                          </span>
                        ) : decisions[f.key].axis === "segment" ? (
                          <span className="ml-auto rounded bg-orange px-1.5 py-0.5 text-[0.75rem] font-bold text-navy"
                                title="값이 환자군 축에 실립니다 — 이 이름은 일반 필드로 남지 않습니다">
                            환자군 축으로 채택
                          </span>
                        ) : (
                          <span className="ml-auto rounded bg-green-soft px-1.5 py-0.5 text-[0.75rem] font-bold text-green">
                            v1.0에 포함
                          </span>
                        )
                      ) : f.alreadyInContract ? (
                        <span className="rounded bg-green-soft px-1.5 py-0.5 text-[0.75rem] font-bold text-green"
                              title="데이터가 현행 스키마를 재발견 — 지금 계약이 옳다는 검증 근거">
                          v{proposal.activeContractVersion} 재확인 ✓
                        </span>
                      ) : fieldDecisions[f.key] === "QUEUED" ? (
                        <span className="rounded bg-navy px-1.5 py-0.5 text-[0.75rem] font-bold text-white">
                          스키마 변경 심사에 올라감 — Data Steward 승인 대기
                        </span>
                      ) : fieldDecisions[f.key] === "HELD" ? (
                        <span className="mono rounded-lg bg-fill-1 px-2 py-0.5 text-[0.75rem] text-body">보류됨</span>
                      ) : (
                        <span className="ml-auto flex gap-1">
                          <Btn size="xs" variant="primary"  onClick={() => adoptField(f).catch((e) => setErr(e.message))}
                                  title="정식 변경 절차(스키마 변경 제안 → Data Steward 승인 → 새 버전)에 올립니다 — 활성 스키마는 승인 전까지 불변"
                                  >
                            변경 심사에 올리기
                          </Btn>
                          <Btn size="xs"  onClick={() => setFieldDecisions((prev) => ({ ...prev, [f.key]: "HELD" }))}
                                  >
                            보류
                          </Btn>
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted">{f.rationaleKo}</p>
                    {f.evidence.slice(0, 2).map((e, i) => (
                      <blockquote key={i} className="mt-2 border-l-2 border-orange pl-2 text-xs italic text-ink">
                        “{e.quote}” <span className="not-italic text-muted">— {e.docId}</span>
                      </blockquote>
                    ))}
                  </div>
                ))}
              </div>
              {proposal.rejected.length > 0 && (
                <details className="rounded-xl border border-glass-line bg-card p-3.5">
                  <summary className="cursor-pointer text-sm font-bold text-navy">
                    제외한 항목 {proposal.rejected.length}건 — 무엇을 뺐는지가 스키마의 절반입니다
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {proposal.rejected.map((r) => (
                      <li key={r.key}><code className="text-ink">{r.key}</code> — {r.reasonKo}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          </SubStep>

          <SubStep mark="c" title="조립과 확정 — Data Steward 승인" state={stepC} last
            receipt={contractActive
              ? <>승인 {contractSt?.approvedBy} · 추출·연속 처리·Field 폼이 열렸습니다</>
              : contractNone ? "고른 항목으로 yaml을 생성합니다"
                             : "확정 전에는 추출·Field 폼이 열리지 않습니다"}
          >
          {assembleNote && !contractActive && (
            <p className="mb-3 rounded-lg bg-green-soft px-3 py-2 text-xs font-bold text-green">{assembleNote}</p>
          )}
            {contractActive ? (
              <p className="rounded-xl border border-green bg-green-soft p-3 text-xs leading-[1.7] text-ink">
                <b className="text-green">Contract v{contractSt?.version} 확정됨</b> — 승인 {contractSt?.approvedBy}
                {contractSt?.approvedAt ? ` · ${hhmmss(contractSt.approvedAt)}` : ""}.
                이 버전이 개발 기준입니다: Field 폼·추출·집계가 전부 이걸 씁니다. 이후 변경은 스키마 변경 심사(SCP)로만.
              </p>
            ) : contractNone ? (
              <div className="text-xs">
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Btn size="xs" variant="primary"  onClick={assembleDraft}
                          disabled={!plan || plan.length === 0 || !!blockReason}
                          title={blockReason ?? "승인하면 이 자리에서 v1.0 yaml이 생성됩니다"}
                          >
                    승인 — 포함 {Object.values(decisions).filter((d) => d.include).length}개 필드로 v1.0 yaml 생성
                  </Btn>
                  <span className={blockReason ? "font-bold text-rust" : "text-muted"}>
                    {!plan || plan.length === 0
                      ? "채택 0건이면 비활성 — 먼저 분할 독해를 완주하고 제안에서 채택하세요."
                      : blockReason
                        ? `아직 승인할 수 없습니다 — ${blockReason}`
                        : "조건 충족 — 승인하면 yaml이 생성되고 저장 구조가 이 스키마를 따릅니다."}
                  </span>
                </div>
                {assembleErr && (
                  <p className="mono mt-2 text-[0.8125rem] leading-[1.7] text-rust">{assembleErr}</p>
                )}
              </div>
            ) : (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange bg-rust-soft p-3 text-xs">
              <span className="text-ink">
                <b className="text-rust">Contract v{contractSt?.version} — 확정 대기.</b>{" "}
                분할 독해로 <b>데이터가 이 스키마를 재발견하는지 검증</b>한 뒤, 아래 버튼으로 확정하세요.
                확정 전에는 추출·연속 처리·Field 폼이 열리지 않습니다 — 스키마 없이 적재된 값은 근거가 없기 때문입니다.
              </span>
              <Btn size="xs" variant="primary"  onClick={() => confirmContract().catch((e) => setErr(e.message))}
                      >
                Contract v{contractSt?.version} 확정 (Data Steward)
              </Btn>
            </div>
            )}
          </SubStep>

        </div>
      </Stage>

      {/* 08/28: SCP 큐를 **Data Contract / 변경 심사**로 옮겼다. 이 화면은 ⓪→①→② 라인을
          한 번 걸어가는 자리이고, 스키마 변경 심사는 계약을 고치는 일이라 드물게 돈다.
          계약을 고치는 일은 전부 Data Contract 아래로 모은다. */}
      {/* 08/28: 용어 사전 후보 심사와 MeSH 외부 용어 매핑을 **Data Contract / 온톨로지**로
          옮겼다. 사전(canonical 125·표면형 164)을 보는 화면이 없어서 이 심사 UI 만 떠 있었고,
          docs/02 는 §2 스키마와 §3 어휘를 같은 문서의 형제로 둔다 — 한 계약의 두 면이다. */}
      <p className="text-xs text-muted">
        분할 독해가 수확한 용어 후보와 MeSH 매핑은{" "}
        <a href="/contract/ontology" className="font-medium text-orange-deep underline underline-offset-2">Data Contract · 온톨로지</a>
        에서 심사합니다.
      </p>

      {/* ── ② 구조화 — 확정 스키마로 비정형 문서를 처리 (08/26: 배치를 여기 통합) ── */}
      <LiveRunner
        spec={agentOf("insight_analyst")}
        contractActive={contractActive}
        ready={!!agentOf("insight_analyst")?.ready}
        blocked={!docsLoaded || !contractActive}
        blockedReason={!docsLoaded ? "먼저 0단계에서 원본을 나눠 주세요."
                       : "1단계에서 Contract를 확정해야 추출이 돕니다."}
        contractVersion={contractActive ? contractSt?.version : null}
        onTick={refreshStrip}
        onFinished={afterRun}
      />



      {/* ── 원문 확대경 — 표에서 행을 클릭하면 여기로 온다 (08/25 통합) ──────
          이전의 [문서 셀렉트 + ② 카드 + ③ 카드 + 결과 그리드] 네 조각을 한 화면으로 합쳤다.
          블록 경계는 수집 기록(DB)에서 즉시 그려지고, ②(AI 귀속 검증)·③(추출)은 보조 버튼이다. */}
      <Fold
        id="magnifier"
        title="원문 근거 대조"
        hint="저장된 근거 위치가 원문의 그 문장을 가리키는지 확인합니다 · 표에서 행을 클릭하면 열립니다"
        tone="quiet"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-[46rem] text-xs text-muted">
            추출값의 문자 범위를 원문 위에 <mark className="bg-orange-soft px-1 text-orange-deep">칠해서</mark> 보여줍니다 —
            표의 숫자가 실제 문장을 가리키는지 눈으로 대조하는 자리입니다.
          </p>
          <select value={docId ?? ""} onChange={(e) => setDocId(e.target.value)}
                  className="rounded-xl border border-glass-line bg-card px-3.5 py-2.5 text-[0.8125rem]"
                  aria-label="문서 직접 선택">
            {docs.length === 0 && <option value="">0단계에서 원본을 먼저 나눠 주세요</option>}
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.id} · {d.sourceFormat} · 의료진 {d.interactionCount}인
              </option>
            ))}
          </select>
        </div>

        {!detail ? (
          <p className="mt-4 text-sm text-muted">
            아직 문서를 고르지 않았습니다 — 위 표의 행을 클릭하거나 오른쪽 셀렉트에서 고르세요.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {/* 원본 파싱 대조 — "이 원문이 원본에서 방금 나온 것"의 증거 */}
            {peekSrc?.binary && peekSrc.extraction && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-glass-line bg-card px-2.5 py-1.5 text-[0.75rem]">
                <span className="font-bold text-navy">원본 {peekSrc.binary.format}</span>
                <code className="text-ink">{peekSrc.binary.filename}</code>
                <span className="text-muted">sha256 <code className="text-ink">{peekSrc.binary.sha256.slice(0, 16)}…</code></span>
                <span className={peekSrc.extraction.match === "FULL" ? "font-bold text-orange" : "font-bold text-rust"}>
                  {peekSrc.extraction.match === "FULL" ? "방금 읽음 — DB 원문과 글자 단위 일치" : "불일치 — 원본 확인 필요"}
                </span>
                <span className="text-muted">{peekSrc.extraction.engine}</span>
                {(peekSrc.maskedChars ?? 0) > 0 && <span className="text-muted">PII {peekSrc.maskedChars}자 마스킹</span>}
              </div>
            )}

            {/* 보조 실행 — ②·③은 저장된 결과가 없을 때만 모델을 돌린다 (08/25 개정).
                08/26: 연속 처리로 이미 결과가 있으면 **접어 둔다** — 확대경의 주인공은
                원문과 구조화 결과이지 실행 버튼이 아니다. */}
            <details open={claims.length === 0} className="text-xs">
              <summary className="mb-2 cursor-pointer font-bold text-navy">
                {claims.length > 0
                  ? `이 문서 도구 — 저장된 claim ${claims.length}건 · 필요할 때만 펼치세요`
                  : "이 문서 도구 — AI 귀속 검증 · 이 문서만 추출"}
              </summary>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {attr && busy !== "attr" ? (
                <span className="rounded-lg border border-green bg-green-soft px-3 py-1.5 font-bold text-green"
                      title="attribution_results에 저장된 검증 결과를 그대로 표시 중 — 모델을 다시 부르지 않습니다">
                  귀속 검증됨{attrAsOf ? ` (${hhmmss(attrAsOf)} 저장본)` : ""} — 재실행 없음
                </span>
              ) : (
                <Btn size="xs"  title="AI가 사람과 같은 방식으로 발언을 나누는지 채점합니다. 문서당 1회만 돌고 결과가 저장됩니다" onClick={() => { setMagErr(null); run("attr", async () => {
                          try {
                            const r = await api<Attribution>(`/documents/${docId}/attribute`, { method: "POST" });
                            setAttr(r); setAttrAsOf(r.storedAt ?? null);
                          }
                          catch (e) { setMagErr(`귀속 실패 — ${e instanceof Error ? e.message : String(e)}`); }
                        }); }}
                        disabled={busy === "attr"}
                        >
                  {busy === "attr" ? `화자 분리 확인 중… ${busySec}초` : "AI 화자 분리 검증"}
                </Btn>
              )}
              {claims.length > 0 && busy !== "extract" ? (
                <>
                  <span className="rounded-lg border border-green bg-green-soft px-3 py-1.5 font-bold text-green"
                        title="claims 테이블에 저장된 추출 결과를 그대로 표시 중 — 모델을 다시 부르지 않습니다">
                    판독됨 (저장된 항목 {claims.length}건) — 재실행 없음
                  </span>
                  <Btn size="xs"  onClick={() => runExtract(true)}
                          disabled={!contractActive}
                          title="용어 사전을 승인한 뒤 새 사전으로 재평가할 때만 — 기존 claim을 지우고 다시 적재합니다 (LLM은 캐시 재생 0원 · 사람이 결정한 claim이 있으면 서버가 거부. 적재 시 자동 승인분은 사람의 결정이 아니라 지워도 됩니다 — sense.human_decided)"
                          className={`disabled:opacity-50`}>
                    이 문서 다시 판독
                  </Btn>
                </>
              ) : (
                <Btn size="xs"  onClick={() => runExtract(false)}
                        disabled={busy === "extract" || !contractActive}
                        title={contractActive ? "아직 추출 전인 문서만 모델이 돕니다" : "1단계에서 Contract를 확정해야 추출할 수 있습니다"}
                        >
                  {busy === "extract" ? `판독 중… ${busySec}초` : "이 문서만 판독"}
                </Btn>
              )}
              <span className="text-muted">
                귀속 검증 = AI가 같은 분리를 재현하는지 채점(1회 후 저장) · 이 문서 추출 = 이 문서만 따로
              </span>
            </div>
            </details>
            {magErr && (
              <p className="rounded-lg border border-rust bg-rust-soft px-3 py-2 text-xs text-ink">{magErr}</p>
            )}
            {attr && (
              <div className="rounded-xl border border-glass-line bg-card p-3 text-xs">
                <b className="text-navy">귀속 검증 완료</b>{" "}
                <span className="text-ink">
                  AI가 {attr.blocks.length}구간 분리 · 커버리지 {Math.round(attr.coverageRatio * 100)}% ·
                  경계 인용 실패 {attr.dropped.length}
                </span>
                {attr.score && (
                  <span className="text-muted">
                    {" "}| 정답 대조: {attr.score.matched}/{attr.score.truthBlocks} 일치 (IoU≥0.8) ·
                    평균 IoU {attr.score.meanIou} — 합성 코퍼스의 정답 분할과 비교, 실데이터에선 이 칸이 비어 나옵니다
                  </span>
                )}
              </div>
            )}
            {extract && (
              <div className="rounded-xl border border-glass-line bg-card p-3 text-xs">
                <b className="text-navy">추출 완료</b>{" "}
                {extract.skipped ? (
                  <span className="text-ink">
                    이미 추출된 문서 — 기존 claim {extract.existingClaims}건을 그대로 표시합니다
                    (모델 미실행 · 재평가가 필요하면 [다시 추출])
                  </span>
                ) : (
                  <span className="text-ink">
                    구간 {extract.blocks}개 읽음 · claim {extract.claims}건 저장 ·
                    근거 불일치 거부 {extract.rejectedNoEvidence} · 안전성 분기 {extract.safety} ·
                    미매핑 용어 {extract.unmapped}
                    {(extract.malformed ?? 0) > 0 &&
                      <> · 형식 불량 폐기 {extract.malformed} (모델이 객체 아닌 값을 반환 — 근거 검증 불가라 버림)</>}
                  </span>
                )}
              </div>
            )}

            {/* 원문 + 구조화 결과 — 한 화면 */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs text-muted">
                  배경색 = 의료진 구간{attr ? " (AI 분리 결과)" : " (수집 기록 기준 — 귀속 검증으로 AI 재현을 확인할 수 있습니다)"} ·{" "}
                  <mark className="bg-orange px-1 text-white">주황</mark> = 추출이 근거로 지목한 문장
                </p>
                <RawText
                  activeClaimId={activeClaimId}
                  text={detail.rawText}
                  blocks={attr?.blocks ?? detail.interactions
                    .filter((i) => i.docCharStart != null && i.docCharEnd != null)
                    .map((i) => ({ hcpSurface: i.hcpRef, specialtySurface: null, institutionSurface: null,
                                   confidence: "CLEAR" as const, boundaryNoteKo: null,
                                   charStart: i.docCharStart as number, charEnd: i.docCharEnd as number }))}
                  claims={claims}
                />
              </div>
              <div>
                <h3 className="mb-1 text-sm font-bold text-navy">
                  구조화 결과 <span className="font-normal text-muted">— 의료진별 {claims.length}건</span>
                </h3>
                <p className="mb-2 text-[0.75rem] text-muted">
                  확정 스키마(Contract v0.1)의 필드대로 AI가 읽어 DB화한 값입니다.
                  카드를 <b className="text-ink">클릭하면 왼쪽 원문의 근거 문장으로 이동</b>합니다 —
                  근거 없는 값은 저장되지 않았습니다.
                </p>
                <div className="max-h-[32rem] space-y-2 overflow-auto">
                  {claims.length === 0 && (
                    <p className="rounded-lg border border-glass-line bg-card p-4 text-sm text-muted">
                      <b className="text-ink">이 문서는 아직 구조화되지 않았습니다.</b> 연속 처리에서
                      아직 차례가 안 왔거나, 처리 중 오류로 건너뛴 문서입니다 — 연속 처리를 다시
                      실행하면 이어서 처리됩니다(캐시에 있으면 0원). 이 문서만 바로 보려면
                      위 [이 문서 도구]를 펼쳐 <b className="text-ink">[이 문서 추출]</b>을 누르세요.
                    </p>
                  )}
                  {claims.map((c) => (
                    <article key={c.id}
                             onClick={() => focusClaim(c.id)}
                             title="클릭 — 왼쪽 원문에서 이 값의 근거 문장으로 이동"
                             className={`cursor-pointer rounded-lg border bg-card p-3.5 transition-colors ${
                               activeClaimId === c.id ? "border-orange/60 bg-orange-soft" : "border-glass-line hover:border-line"}`}>
                      <div className="flex flex-wrap items-center gap-2 text-[0.75rem]">
                        <code className="font-bold text-navy">{c.interactionId}</code>
                        {/* 칩은 한국어 라벨(코드는 툴팁) — 환자군 미상(UNSPECIFIED)은 칩을 접는다:
                            "특정 안 됨"은 값이지 정보가 아니라서 카드에선 소음이다 (08/25). raw 표에는 남는다 */}
                        <span title={c.signalType} className="mono rounded-lg bg-fill-1 px-2 py-0.5 text-[0.75rem] text-body">
                          {enumLabel(axes?.signal ?? "signal_type", c.signalType)}
                        </span>
                        {c.patientSegment !== "UNSPECIFIED" && (
                          <span title={c.patientSegment} className="mono rounded-lg bg-fill-1 px-2 py-0.5 text-[0.75rem] text-body">
                            {enumLabel(axes?.segment ?? "patient_segment", c.patientSegment)}
                          </span>
                        )}
                        {c.labelScope === "OUT_OF_LABEL" && (
                          <span className="rounded bg-rust-soft px-1.5 py-0.5 font-bold text-rust">허가 범위 밖</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-ink">{c.summaryKo}</p>
                      <blockquote className="mt-1 border-l-2 border-orange pl-2 text-xs italic text-muted">
                        “{c.verbatimQuote}”
                      </blockquote>
                      <p className="mt-1 text-[0.75rem] text-muted">
                        근거 위치 {c.evidence.charStart}–{c.evidence.charEnd}자 · 상태 {c.status}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Fold>

      {/* ── 결과 영역 — 라인이 돌기 전에는 비워 둔다: 결과는 산출물이지 초기값이 아니다 (08/25) ── */}
      {!docsLoaded ? (
        <section className="rounded-2xl border border-dashed border-line bg-card px-5 py-5 text-[0.9375rem] leading-[1.7] text-muted">
          결과는 라인이 돈 뒤에 나타납니다 — 먼저 <b className="text-ink">0단계 원본 분해</b>부터 시작하세요.
        </section>
      ) : (
        <>
          {/* 결과 계기판 — 라인이 흐른 끝의 집계 (처리 요약이 먼저, 실물 테이블이 다음) */}
          <StripBar strip={strip} />

      {/* 08/28: 가설 섹션을 **신호와 가설** 화면으로 옮겼다. 라인은 숫자로 끝나고,
          가설은 자기 이름을 가진 화면에서 다룬다 — docs/01 §3 이 "신호와 가설은 다른
          것"이라며 두 단계로 가른다. 카드는 옮기지 않았다(그 화면에 이미 있다). */}
      <p className="text-[0.875rem] leading-[1.7] text-muted">
        임계를 넘은 조합에서 가설을 세우는 것은{" "}
        <a href="/hypotheses" className="font-medium text-orange-deep underline underline-offset-2">신호와 가설</a>
        에서 합니다.
      </p>

        </>
      )}

      {/* 08/28: 호출 기록·비용을 **실행 기록(AUDIT) 화면으로 옮겼다.**
          이 화면은 ⓪·① 순서를 걸어가는 자리인데, 호출 기록과 비용은 순서의 걸음이 아니라
          이미 끝난 일의 증빙이다. 순서 안에 끼어 있으면 "지금 이걸 해야 하나"로 읽힌다.
          위치로 성격을 말한다 — 링크만 남긴다. */}
      <p className="text-xs text-muted">
        이 화면이 부른 모델 호출과 그 비용은{" "}
        <a href="/audit" className="font-medium text-orange-deep underline underline-offset-2">실행 기록</a>
        에서 봅니다.
      </p>

      {/* ── AI Readable 데이터 — DB claims 행 그 자체. **참고 자료라 맨 아래** (08/26 건태):
          작업 순서가 아니라 "지금 뭐가 쌓였나"를 확인하는 자리다. 순서 사이에 끼면
          라인이 길어져 다음에 뭘 눌러야 하는지가 묻힌다. 기본은 접어 둔다. ── */}
      {/* id: 홈 대시보드의 [추출된 Claim] 카드가 이리로 온다 (08/27) */}
      <Fold
        id="ai-readable"
        title="AI Readable 데이터 — 지금 DB에 있는 실제 테이블"
        badge={table && table.rows.length > 0
          ? <Chip>{table.rows.length.toLocaleString()}행</Chip>
          : <Chip>비어 있음</Chip>}
        hint="라인이 만든 실물 행 — claims 테이블 그대로"
        tone="quiet"
      >
        <p className="text-xs text-muted">
          비정형 원문이 라인을 통과한 최종 산출물입니다. 아래는 요약이 아니라{" "}
          <b className="text-ink">claims 테이블의 행 그 자체</b> — 스키마 컬럼에 의료진별로 값이
          들어가 있고, 모든 행이 원문 근거 위치(evidence)를 갖습니다.{" "}
          <b className="text-ink">미리 넣어둔 행은 없습니다</b> — 연속 처리가 만든 행만 쌓입니다.
        </p>
        {!table || table.rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            아직 행이 없습니다 — 연속 처리가 돌면 여기에 쌓입니다.
          </p>
        ) : (
          <>
            <p className="mt-2 text-xs text-ink">
              총 <b className="text-navy">{table.total.toLocaleString()}행</b>
              {" · "}시드 {table.byOrigin.seed} · 추출 {table.byOrigin.extracted}
              {table.total > table.rows.length
                ? ` · 최근 ${table.rows.length.toLocaleString()}행 표시`
                : " · 전량 표시 (숨긴 행 없음)"}
            </p>
            <p className="mt-1 text-[0.75rem] text-muted">
              열 구성은 <b className="text-ink">활성 스키마 v{contractSt?.version}</b>에서 그대로 나옵니다
              (헤더 아래 <code>field_key</code>가 스키마의 필드 그 자체) — 스키마 변경이 승인돼 구조가 자라면
              이 표의 열도 같이 자랍니다. <b className="text-ink">허가 범위</b>는 스키마 필드가 아니라
              서버 파생 규칙이 계산한 컬럼입니다.
            </p>
            {/* 높이 고정 (08/26) — 수천 행이 페이지를 밀어내지 않게 표 안에서만 스크롤.
                헤더는 sticky로 고정해 어느 열인지 놓치지 않게 한다 */}
            <div className="mt-2.5 max-h-[34rem] overflow-auto rounded-lg border border-glass-line bg-card">
              <table className="w-full min-w-[1400px] text-left text-[0.75rem]">
                <thead className="sticky top-0 z-10 bg-on-navy-3 backdrop-blur-sm">
                  <tr>
                    {["의료진", "발생일"].map((h) => (
                      <th key={h} className={TH}>{h}</th>
                    ))}
                    {/* 스키마 컬럼 — 활성 계약의 필드가 그대로 열이 된다. 라벨 밑에 필드 key를
                        병기해 ①의 확정 스키마 목록과 눈으로 1:1 대조되게 한다 (08/25) */}
                    {activeFields && Object.entries(activeFields).map(([key, f]) => (
                      <th key={key} className={TH}>
                        {f.labelKo}
                        <code className="block text-[0.75rem] font-normal text-muted">{key}</code>
                      </th>
                    ))}
                    <th className={TH}
                        title="스키마 필드가 아니라 파생 규칙(서버 결정론 계산)의 결과 — patient_segment·signal_type에서 자동 판정">
                      허가 범위
                      <code className="block text-[0.75rem] font-normal text-muted">label_scope · 파생</code>
                    </th>
                    {/* 08/28 신설 — docs/08 §2.1 의 AI Readable 조건 ③·①. 데이터에는 있었는데
                        표에 컬럼이 없어 "누가 무엇을 봐도 되는지"와 "어느 버전으로 만들어졌는지"가
                        화면에서 안 보였다. 벡터DB로는 못 얻는 것이 바로 이 둘이다. */}
                    <th className={TH} title="조회 권한이 프론트 필터가 아니라 쿼리 제약으로 걸리는 근거">
                      목적 도메인
                      <code className="block text-[0.75rem] font-normal text-muted">purpose_domain</code>
                    </th>
                    {["원문 인용 (verbatim)", "근거 위치", "등급", "상태"].map((h) => (
                      <th key={h} className={TH}>{h}</th>
                    ))}
                    <th className={TH} title="이 행이 만들어진 시점의 계약 버전 — 과거 데이터는 생성 당시 버전을 보존한다">
                      계약 버전
                      <code className="block text-[0.75rem] font-normal text-muted">contract_version</code>
                    </th>
                    <th className={TH}>출처</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((r) => (
                    <tr key={r.id}
                        onClick={() => jumpToDoc(r.evidence.docId)}
                        title="클릭 — 원문 확대경에서 이 행의 근거를 원문 위에서 확인"
                        className={`cursor-pointer align-top hover:bg-fill-1 ${
                          docId === r.evidence.docId ? "bg-orange-soft" : ""}`}>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <code className="font-bold text-navy">{r.hcpRef}</code>
                        {r.hcpSpecialty && <span className="ml-1 text-muted">{r.hcpSpecialty}</span>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">{r.occurredOn ?? "—"}</td>
                      {activeFields && Object.entries(activeFields).map(([key, f]) => {
                        const val = key === axes?.segment ? r.patientSegment
                          : key === axes?.signal ? r.signalType
                          : r.fields?.[camel(key)];
                        const opt = f.values?.find((v) => v.value === val);
                        return (
                          <td key={key} title={opt?.labelKo}
                              className="whitespace-nowrap px-2 py-1.5 text-ink">
                            {val == null || val === "" ? <span className="text-muted">—</span> : String(val)}
                          </td>
                        );
                      })}
                      {/* 허가 범위 — 파생 컬럼 (08/25 복원): 스키마 동적 컬럼 전환 때 빠졌던
                          절대 규칙 #5의 분리 표시를 고정 열로 되살린다 */}
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {r.labelScope === "OUT_OF_LABEL"
                          ? <span className="rounded bg-rust-soft px-1.5 py-0.5 font-bold text-rust">범위 밖</span>
                          : <span className="text-muted">범위 내</span>}
                      </td>
                      {/* 목적 도메인 — 조건 ③. 이 값이 있어서 조회 권한이 쿼리 제약으로 걸린다 */}
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {r.purposeDomain
                          ? <span className="mono rounded-lg bg-fill-2 px-2 py-0.5 text-[0.75rem] font-medium text-ink">{r.purposeDomain}</span>
                          : <span className="text-faint">—</span>}
                      </td>
                      <td className="max-w-[340px] px-2 py-1.5 text-ink">
                        <span className="line-clamp-2 italic">“{r.verbatimQuote}”</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                        <code>{r.evidence.docId}</code> {r.evidence.charStart}–{r.evidence.charEnd}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">{r.reviewGrade}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">{r.status}</td>
                      {/* 계약 버전 — 조건 ①. 과거 행은 생성 당시 버전을 그대로 보존한다 */}
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {r.contractVersion
                          ? <span className="mono text-[0.75rem] text-muted">v{r.contractVersion}</span>
                          : <span className="text-faint">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {r.origin === "SEED"
                          ? <span className="mono rounded-lg bg-fill-1 px-2 py-0.5 text-[0.75rem] text-body">시드</span>
                          : <span className="rounded bg-green-soft px-1.5 py-0.5 font-bold text-green">추출</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Fold>

      {/* 08/28: 구조 루프 도구(환자군 공백·자유값 승격·신호 감사)도
          **Data Contract / 변경 심사**로 옮겼다 — 그 도구들이 만드는 것이 SCP 후보이고,
          심사하는 자리와 만드는 자리가 붙어 있어야 한다. */}
      <p className="text-xs text-muted">
        스키마 변경 심사와 구조 루프 도구는{" "}
        <a href="/contract/evolve" className="font-medium text-orange-deep underline underline-offset-2">Data Contract · 변경 심사</a>
        에 있습니다.
      </p>
      </div>
    </>
  );
}
