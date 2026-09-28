/**
 * 가설 보드 — 목업 7b 의 두 칸 구조를 그대로 따른다.
 *
 * In-label 과 Development 를 **처음부터 나눠 둔다.** 섞이면 어떤 것이 상업 조직으로
 * 갈 수 있는지 알 수 없게 된다 (절대 규칙 #5). 카드의 숫자는 전부 서버가 센 것이다.
 */

import Link from "next/link";
import { api } from "@/lib/api";
import { Panel, Eyebrow, SectionHead, Row, Chip, Grade, Topbar, Placeholder } from "@/app/components/ui";
import ConfirmPanel from "./ConfirmPanel";
import ScreenBench from "./ScreenBench";
import AgendaLedger from "./AgendaLedger";
import GenerateBar from "./GenerateBar";
import ResetLayer from "./ResetLayer";

type Hyp = {
  id: string;
  titleKo: string;
  kind: "IN_LABEL" | "DEVELOPMENT";
  status: string;
  patientSegment: string;
  commercialActionBlocked: boolean;
  notBoardReadyReason: string | null;
  // 목록에만 실린다 (08/29) — 없으면 아예 키가 없다. 없는 것과 0 은 다르다.
  screenSummary?: { judgments: number; externalSupport: number; support: number; counter: number };
  // 회의록이 있는가 (08/30, 목록에만) — IN_REVIEW 가 "상정만 됐다"와 "회의가 끝나
  // 사람 결정을 기다린다"를 겸하므로, 이 값이 둘을 가른다. 키가 없으면 모르는 것이다.
  hasMinutes?: boolean;
  boardSummary?: { decision: string; decidedAt: string };
  // **지금 데이터로 다시 센 관문.** 저장된 사유(notBoardReadyReason)는 Screen 실행 때만
  // 갱신되므로, 컨펌으로 근거가 쌓여도 옛 값이 남는다 — 그때 화면이 거짓말을 했다.
  basisGate?: { approved: number; distinctHcp: number; distinctRegions: number;
                reasonKo: string | null;
                requires: { approved: number; distinctHcp: number; distinctRegions: number } };
  confirmedBy?: string | null;
  // 외부 근거를 본 사람의 서명 (08/30, Human in the loop) — 심의행의 관문.
  // `canSendToBoard` 는 서버가 계산한다: 관문의 정본이 서버라는 것을 응답이 말한다.
  evidenceReviewedBy?: string | null;
  evidenceReviewedAt?: string | null;
  evidenceReviewable?: boolean;
  canSendToBoard?: boolean;
  driverSummaryKo: string | null;
  aggregate: {
    claimCount?: number; distinctHcp?: number; distinctRegions?: number;
    priority?: string; signalKind?: string; belowThreshold?: boolean;
  } | null;
};

type Strip = { hypotheses: { draft: number; nearThreshold: number } };
type PipeCounts = { stages: Record<string, number>; byStatus: Record<string, number>;
                   /** IN_REVIEW 를 회의록 유무로 가른 SQL 집계 (08/31) — 둘의 합이 byStatus.IN_REVIEW. */
                   boardStages?: { convening: number; awaitingDecision: number };
                   computedBy: string };

/** 명부 위 한 줄 — 어느 단계에 몇 건인지. 화면은 세지 않고 서버가 센 것을 늘어놓기만 한다. */
const STATUS_ORDER = ["DRAFT", "SCREEN_QUEUED", "SCREENING", "NOT_BOARD_READY",
                      "BOARD_READY", "IN_REVIEW", "APPROVED", "HOLD", "REJECTED", "RETIRED"];
function StageSummary({ pipe }: { pipe: PipeCounts }) {
  const seen = STATUS_ORDER.filter((k) => (pipe.byStatus[k] ?? 0) > 0);
  const extra = Object.keys(pipe.byStatus).filter((k) => !STATUS_ORDER.includes(k) && pipe.byStatus[k] > 0);
  return (
    <Panel pad="md" className="mt-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <span className="mono text-[0.8125rem] text-muted">가설</span>
        {/* 총계는 **서버가 센 것만** 쓴다 — 칸을 더해 만들지 않는다(blocked가 screen과
            겹쳐 두 번 세어진다). 배포가 구버전이라 all이 없으면 총계만 생략하고
            상태별 숫자는 그대로 보여준다 — 화면이 숫자를 지어내지는 않는다. */}
        {typeof pipe.stages.all === "number" && (
          <>
            <b className="text-[1.0625rem] font-bold leading-none text-navy">{pipe.stages.all}건</b>
            <span className="text-faint">·</span>
          </>
        )}
        {[...seen, ...extra].map((k) => (
          <span key={k} title={k} className="text-[0.875rem] leading-none text-body">
            {STATUS_KO[k] ?? k}{" "}
            <b className={`font-medium ${k === "IN_REVIEW" ? "text-orange-deep" : "text-navy"}`}>
              {pipe.byStatus[k]}
            </b>
          </span>
        ))}
        <span className="mono ml-auto text-[0.75rem] text-faint">SQL 집계</span>
      </div>
    </Panel>
  );
}

/** 좌측 메뉴가 쿼리로 단계를 나눠 부른다 — 같은 화면이 세 칸을 겸한다 (08/26). */
const STAGES: Record<string, { title: string; eyebrow: string; desc: string; statuses: string[] | null }> = {
  // 가설 보드는 **명부**다 (08/27). 전에는 DRAFT만 보여줘서, Screen으로 한 번 보내면
  // 그 가설이 이 화면에서 통째로 사라졌다 — 7건을 뽑아 놓고 보드가 비어 있었다.
  // 라인의 산출물이 어디까지 갔는지 한 자리에서 보이는 것이 이 화면의 일이다.
  // statuses: null = 전부.
  "": {
    title: "신호와 가설", eyebrow: "SENSE",
    desc: "AI Readable 전환이 만들어 낸 가설 전부입니다. 임계를 넘은 조합이 자동으로 가설이 되고, 라벨 범위 안과 밖을 처음부터 나눠 둡니다. 카드마다 지금 어느 단계에 있는지 표시됩니다.",
    statuses: null,
  },
  screen: {
    title: "다중 에이전트 검증", eyebrow: "SCREEN",
    // "근거가 충분한 것만 보낼 수 있다"는 08/30부터 사실이 아니다 — 충분한지를 판단하는
    // 것이 사람이고, 이 화면은 그 판단의 재료를 모아 주는 곳이다 (Human in the loop).
    desc: "생성된 가설은 예외 없이 여기서 공개 근거와 대조됩니다. 왼쪽에서 한 건을 고르면 검토관 6인이 모은 근거가 열리고, 그것을 읽은 사람이 상정 여부를 정합니다.",
    // DRAFT가 여기 있는 이유: 생성된 가설은 **무조건** Screen 검증을 받는다(08/27).
    // 보내기 버튼을 없앴으므로 갓 만들어진 가설이 곧바로 이 화면의 [Screen 실행] 대상이다.
    statuses: ["DRAFT", "SCREEN_QUEUED", "SCREENING", "BOARD_READY", "NOT_BOARD_READY"],
  },
  board: {
    title: "심의", eyebrow: "AI BOARD",
    desc: "다섯 자리가 각자 의견을 내고 CEO가 권고하지만, 결정은 사람이 합니다.",
    statuses: ["IN_REVIEW", "APPROVED", "HOLD", "REJECTED"],
  },
};

/** 상태를 사람 말로 — 원래 enum 은 title 속성으로 남겨 추적 가능하게 둔다 (08/26). */
const STATUS_KO: Record<string, string> = {
  DRAFT: "임계 통과 · Screen 대기",
  SCREEN_QUEUED: "Screen 대기",
  SCREENING: "근거 수집 중",
  BOARD_READY: "심의 대기",
  // "근거 부족"(08/28) → "상정 조건 미달"(08/29) → **"검토 필요"**(08/30).
  // 앞의 둘은 «못 간다»는 뜻이었는데, 08/30부터 사람이 근거를 보고 서명하면 간다.
  // 못 가는 칸이 아니라 **사람을 기다리는 칸**이므로 라벨이 사람을 부른다.
  NOT_BOARD_READY: "외부 근거 검토 필요",
  IN_REVIEW: "심의 결론 · 승인 대기",
  APPROVED: "승인됨",
  HOLD: "보류",
  REJECTED: "반려됨",
  // 08/30: STATUS_ORDER 에는 있는데 여기 없어서 요약 줄이 영문 `RETIRED` 를 그대로 찍었다.
  // 목록에서는 기본으로 숨는 상태라 눈에 안 띄었는데, 신원 재설계(#110·#111)로 «병합돼
  // 한 장으로 합쳐진» 행이 실제로 생기면서 요약 줄에 드러난다.
  RETIRED: "내려감 (근거 소멸 · 병합)",
};
/** IN_REVIEW 는 두 상태를 겸한다 (08/30) — 상정 직후(회의 전)와 회의 종료(결정 대기).
 *  갓 상정된 가설이 "심의 결론"이라 말하면 카드가 없는 결론을 주장하는 셈이라, 회의록
 *  유무(서버 hasMinutes)로 갈라 말한다. 키가 없으면(상세 등) 모르는 것이므로 기존 문구. */
const preMeeting = (h: Hyp) => h.status === "IN_REVIEW" && h.hasMinutes === false;
const statusKo = (h: Hyp) =>
  preMeeting(h) ? "상정됨 · 회의 소집 대기" : (STATUS_KO[h.status] ?? h.status);
/** 임계값 문구 — 정본은 backend/app/hypothesis_gen.py 의 THRESHOLD_*. 바뀌면 여기도. */
const THRESHOLD_KO = { repeat: 5, hcp: 3 };

const GRADE: Record<string, "h" | "m" | "l"> = { HIGH: "h", MEDIUM: "m", LOW: "l" };
/* 회의장 진입 문구(BOARD_ROOM)·실행 컴포넌트 import 는 08/31 에 함께 지웠다 — 전부
   작업 카드(HypCard) 하나만 쓰던 것이고, 그 자리는 안건 대장의 「다음 걸음」 열이 맡는다.
   ScreenRunner·EvidenceReview 는 ScreenBench 가, HandoffBar 는 AgendaLedger 가 직접 부른다. */

/** 이 가설이 지금 서 있는 층 — 화면 칸 정의(STAGES)를 **그대로** 쓴다 (08/29).
 *
 * 목록을 새로 만들면 화면이 보여주는 칸과 링크가 갈라진다. `null`은 "다음 자리를 모른다"이고
 * 그때는 링크를 걸지 않는다 — 지금까지는 맵에 없는 상태가 **전부 조용히 Screen으로 샜다**
 * (RETIRED도, 앞으로 늘어날 상태도). 새는 것보다 없는 편이 정직하다. */
function stageOf(status: string): "screen" | "board" | null {
  if (STAGES.screen.statuses?.includes(status)) return "screen";
  if (STAGES.board.statuses?.includes(status)) return "board";
  return null;
}

/** 읽는 카드의 다음 걸음 — **가리키는 곳은 그 가설이 서 있는 층**이다 (08/29).
 *
 * 전에는 `BOARD_ROOM`에 있으면 회의장, 없으면 전부 `?stage=screen`이었다. 문제가 셋이었다:
 *  ① 링크에 **id가 없어** "열기"를 눌러도 8건짜리 목록이 나왔다
 *  ② **BOARD_READY(심의 대기)도** else로 떨어져 검증 목록으로 되돌아갔다 — 앞으로 갈 카드가 뒤로
 *  ③ 맵에 없는 상태가 조용히 Screen으로 샜다
 * 문구도 상태마다 다르게 준다 — "열기"는 무엇을 하러 가는지 말하지 않는다. */
const NEXT_STEP: Record<string, string> = {
  // DRAFT 의 다음 걸음은 **에이전트 실행이 아니라 사람의 컨펌**이다 (08/29).
  // 08/27 이 없앤 것은 "Screen 으로 보낼까 말까"라는 거짓 선택지였고, 컨펌은 다른 것이다 —
  // "이 신호들이 이 가설을 받치나"를 사람이 판단하는 걸음이다.
  DRAFT: "이 가설을 컨펌",
  SCREEN_QUEUED: "다중 에이전트 검증에서 실행",
  SCREENING: "검증 진행 보기",
  NOT_BOARD_READY: "막힌 사유 확인",
  BOARD_READY: "검증 통과 — 심의로 보내기",
};

/** NOT_BOARD_READY 사유 코드 → 사람 말 (docs/01 §3). 원래 코드는 title 로 남긴다. */
/** basisGate 가 판정하는 사유는 이 둘뿐이다 — `basis_gate_reason()` 이 낼 수 있는 전부다.
 *  ③(외부 지지)·④(Critic 차단)는 `screen_findings` 로만 판정되므로 basisGate 에 **절대**
 *  안 담긴다. 그래서 `!basisGate.reasonKo` 하나로 "관문 충족"을 말하면, ③④에 막힌 가설이
 *  화면에서 통과한 것으로 보인다 — 저장된 사유가 낡은 것이 아니라 **현행**인 경우다. */
const BASIS_REASONS = ["NO_APPROVED_BASIS", "SINGLE_SOURCE"];
const basisStale = (h: Hyp) =>
  !!h.notBoardReadyReason && BASIS_REASONS.includes(h.notBoardReadyReason);

const REASON_KO: Record<string, string> = {
  NO_APPROVED_BASIS: "승인된 내부 근거가 없습니다 — 이 가설의 [근거 확정]에서 인용할 claim을 먼저 승인하세요",
  SINGLE_SOURCE: "근거 출처가 단일합니다 — 독립 의료진·권역 다양성이 부족합니다",
  NO_EXTERNAL_EVIDENCE: "외부 지지 근거가 0건입니다 — 근거가 없으면 순위를 매기지 않습니다",
  CRITIC_BLOCKED: "판정이 이중 확인(출처 검증)에서 전부 제외됐습니다",
};

/** 워크벤치가 먹는 것 — 목록 카드(Hyp)에 상세 전용 두 필드를 얹은 모양 */
type BenchDetail = Hyp & {
  screenFindings?: {
    agent: string; findingType: "SUPPORT" | "COUNTER" | "GAP" | "SAFETY_SIGNAL";
    statementKo: string; sourceUrl: string | null; sourceAsOf: string | null; caveatKo: string | null;
  }[];
  screenReview?: { passed: number; excluded: { agent: string | null; reason: string; statementKo: string }[] };
};

export const dynamic = "force-dynamic";

// 임계값은 서버가 정한다 (hypothesis_gen.THRESHOLD_*). 화면은 설명만 하므로 상수로 둔다 —
// 값이 바뀌면 백엔드가 진실이고 여기는 문구다.
const THRESHOLD = { repeat: 5, hcp: 3 };

/* 「작업 카드」(HypCard) 는 08/31 에 지웠다 — board 칸의 2열 그리드가 유일한 사용처였고,
   그 자리를 안건 대장(AgendaLedger)이 대신하면서 부르는 곳이 없어졌다. 되살릴 일이
   생기면 이 커밋을 되돌린다 (읽는 카드 HypReadCard 는 Sense 칸에 그대로 있다). */

/** 신호와 가설의 카드 — **읽는 카드**다 (08/27 재설계).
 *
 * 처음엔 Screen 검증과 같은 카드를 썼는데, 그러면 두 화면이 사실상 같아진다
 * (같은 두 칸 배치 · 같은 실행 버튼). 팀장 지적: 가설 보드는 "무엇이 생성됐고
 * 무슨 내용인가"를 읽는 자리고, 실행은 Screen 검증의 일이다.
 *
 * 그래서 여기는 **가로로 긴 한 장**이고 버튼이 없다. 라벨 범위 안/밖은 칸을 갈라
 * 나누는 대신 **카드마다 표시**한다 — 절대 규칙 #5가 요구하는 것은 구분이 보이는
 * 것이고, 그것은 두 칸 배치가 아니라 이 배지가 한다.
 */
function HypReadCard({ h }: { h: Hyp }) {
  const a = h.aggregate ?? {};
  const dev = h.kind === "DEVELOPMENT";
  const stage = stageOf(h.status);
  // driverSummaryKo 는 서버가 `근거 / 집계 / 확인할 질문:` 으로 이어 붙인 한 줄이다.
  // 줄로 갈라 읽기 쉽게만 만든다 — 형식이 바뀌어도 그냥 한 줄로 나온다.
  const parts = (h.driverSummaryKo ?? "").split(" / ").map((x) => x.trim()).filter(Boolean);
  const question = parts.find((x) => x.startsWith("확인할 질문:"));
  const body = parts.filter((x) => x !== question);

  return (
    // 회의 전 IN_REVIEW 는 물들이지 않는다 (08/30) — HypCard 의 awaitingHuman 과 같은 판단
    <Panel pad="lg" active={h.status === "IN_REVIEW" && !preMeeting(h)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <Grade level={GRADE[a.priority ?? "MEDIUM"] ?? "m"} />
        <span className="mono text-[0.8125rem] font-medium text-navy">{h.id}</span>
        <span
          title={dev ? "미승인 적응증·환자군이라 Development 경로로 갑니다 — 임상 개발 검토·근거 생성·다음 수집 겨냥은 여기서 이어집니다. 상업 액션에는 자동 연결되지 않습니다."
                     : "허가 라벨 범위 안의 가설입니다."}
          className={`rounded-lg px-2 py-0.5 text-[0.75rem] font-bold ${
            dev ? "bg-orange-soft text-orange-deep" : "bg-fill-1 text-body"}`}
        >
          {dev ? "Development · 라벨 범위 밖" : "In-label · 라벨 범위 안"}
        </span>
        {/* 지금 어느 층에 있나 — 링크가 "지름길"이 아니라 "제자리"임을 눈으로 보인다 (08/29) */}
        <span className="mono ml-auto flex items-center gap-1 text-[0.6875rem] tracking-wide"
              title="가설은 SENSE에서 서고, SCREEN에서 외부 근거와 대조되고, AI BOARD에서 심의됩니다.">
          {(["SENSE", "SCREEN", "AI BOARD"] as const).map((label, i) => {
            const here = (stage === null && i === 0) || (stage === "screen" && i === 1)
                      || (stage === "board" && i === 2);
            return (
              <span key={label} className="flex items-center gap-1">
                {i > 0 && <span className="text-faint">▸</span>}
                <span className={here ? "font-bold text-orange-deep" : "text-faint"}>{label}</span>
              </span>
            );
          })}
        </span>
        {/* 회의 전/후를 가르는 판정은 #109, 글자 크기는 이 브랜치의 리스킨 — 08/30 병합.
            IN_REVIEW 는 «상정 직후»와 «회의 종료»를 겸하므로 오렌지는 회의 뒤에만 준다. */}
        <span title={h.status} className={`mono text-[0.75rem] font-medium ${
          h.status === "IN_REVIEW" && !preMeeting(h) ? "text-orange-deep" : "text-muted"}`}>
          {statusKo(h)}
        </span>
      </div>

      <b className="mt-2.5 block text-[1.0625rem] font-medium leading-[1.5] text-navy">{h.titleKo}</b>

      {body.map((x, i) => (
        <p key={i} className={`mt-1.5 text-[0.875rem] leading-[1.7] ${
          i === 0 ? "text-body" : "mono text-[0.875rem] text-muted"}`}>{x}</p>
      ))}

      {question && (
        <p className="mt-2.5 rounded-xl border border-glass-line bg-card px-3.5 py-2.5 text-[0.875rem] leading-[1.7] text-body">
          {question}
        </p>
      )}

      {/* **컨펌은 Sense 층의 관문이다 (08/29).** 사람이 판단하는 세 걸음 중 ①이고,
          "가설이 탄생하면 그 가설을 인정한다"가 이 화면의 일이다. 처음엔 Screen 화면에만
          뒀는데, 그러면 신호와 가설에서 본 가설을 인정하려고 다른 화면으로 건너가야 한다.
          08/27 의 "읽는 화면" 원칙이 없앤 것은 **에이전트를 돌리는 실행 버튼**이지 사람의
          판단이 아니다 — 접힌 버튼 하나이므로 읽는 성격도 유지된다. */}
      {(h.status === "DRAFT" ||
        (h.status === "NOT_BOARD_READY" &&
         ["NO_APPROVED_BASIS", "SINGLE_SOURCE"].includes(h.notBoardReadyReason ?? ""))) && (
        <ConfirmPanel hypId={h.id} status={h.status} />
      )}

      <div className="mono mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3 text-[0.8125rem] text-body">
        <span>반복 {a.claimCount ?? "—"}</span>
        <span>독립 의료진 {a.distinctHcp ?? "—"}</span>
        <span>권역 {a.distinctRegions ?? "—"}</span>
        {a.belowThreshold && <span className="text-orange-deep">임계 미달</span>}
        {/* 읽는 카드도 **살아 있는 관문**을 말한다 (08/29). 여기는 지금까지 영문 코드를
            날것으로 찍고 있었고(작업 카드만 한국어였다), 저장된 사유는 Screen 실행 때만
            갱신되므로 컨펌으로 채워져도 계속 "막혔다"고 했다. 두 값을 나란히 놓는다. */}
        {h.basisGate && !h.basisGate.reasonKo && basisStale(h) ? (
          <span className="text-orange-deep">
            {/* 슬래시를 쓰지 않는다 — 바로 아래 분기에서 같은 기호가 '현재/필요'를 뜻해
                같은 글자가 두 가지로 읽혔다 */}
            관문 충족 — 승인 {h.basisGate.approved} · 의료진 {h.basisGate.distinctHcp}
            {" · "}권역 {h.basisGate.distinctRegions}. 검증 다시 돌리면 갱신됩니다
          </span>
        ) : h.notBoardReadyReason && !basisStale(h) ? (
          <span className="text-orange-deep" title={h.notBoardReadyReason}>
            {REASON_KO[h.notBoardReadyReason] ?? h.notBoardReadyReason}
          </span>
        ) : h.basisGate?.reasonKo ? (
          <span className="text-muted" title={h.basisGate.reasonKo}>
            관문 {h.basisGate.approved}/{h.basisGate.requires.approved}
            {" · "}의료진 {h.basisGate.distinctHcp}/{h.basisGate.requires.distinctHcp}
            {" · "}권역 {h.basisGate.distinctRegions}/{h.basisGate.requires.distinctRegions}
          </span>
        ) : null}
        {/* **Sense가 내는 길은 Screen 하나뿐이다** (08/29 소정).
            전에는 심의에 오른 가설만 회의장으로 빠졌다 — 같은 화면의 같은 모양 카드 9장 중
            1장만 다른 곳으로 가서, 카드를 보고는 어디로 갈지 예측할 수 없었다.
            그 링크의 출처는 설계가 아니라 08/28 병합이었다: #87이 **작업 카드**(HypCard)에
            만든 회의장 진입이 읽는 카드로 옮겨 붙은 것이다.
            빼도 잃는 것이 없다 — 회의장은 HypCard(아래)와 좌측 메뉴 AI BOARD 칸으로 간다.
            **Screen 단계가 아니면 링크를 걸지 않는다.** IN_REVIEW 를 `?stage=screen` 으로
            보내면 그 화면의 statuses 에 없어 **앵커가 아무 데도 안 닿는다** — 없는 편이 정직하다.
            어디까지 왔는지는 위의 SENSE ▸ SCREEN ▸ AI BOARD 표시가 답한다. */}
        {stage === "screen" && (
          <Link href={`/hypotheses?stage=screen#${h.id}`}
                className="ml-auto font-medium text-orange-deep underline underline-offset-2">
            {NEXT_STEP[h.status] ?? "다중 에이전트 검증에서 열기"} →
          </Link>
        )}
      </div>
    </Panel>
  );
}

export default async function HypothesesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; hyp?: string }>;
}) {
  const { stage = "", hyp = "" } = await searchParams;
  const view = STAGES[stage] ?? STAGES[""];

  let all: Hyp[] = [];
  let error: string | null = null;
  try {
    all = await api<Hyp[]>("/hypotheses");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  // 단계 요약 — 명부 위에 "지금 어디에 몇 건"을 한 줄로. 전부 서버 SQL (절대 규칙 #1)
  let pipe: PipeCounts | null = null;
  try {
    pipe = await api<PipeCounts>("/hypotheses/pipeline");
  } catch {
    pipe = null;
  }
  // 임계 근접 건수는 서버가 센다 — 화면은 세지 않는다 (절대 규칙 #1)
  let strip: Strip | null = null;
  try {
    strip = await api<Strip>("/aggregates/pipeline");
  } catch {
    strip = null;
  }

  const hyps = view.statuses ? all.filter((h) => view.statuses!.includes(h.status)) : all;
  const dev = hyps.filter((h) => h.kind === "DEVELOPMENT");

  // Screen 층은 워크벤치다 (08/31) — 왼쪽 대기줄에서 고른 한 건을 오른쪽에서 정독한다.
  // **선택은 URL 에 둔다**: 서버가 그대로 그리고, 뒤로 가기·새로고침·링크 공유가 저절로 된다.
  // 고르지 않았으면 첫 건을 편다 — 빈 무대를 먼저 보여줄 이유가 없다.
  let bench: BenchDetail | null = null;
  if (stage === "screen" && hyps.length > 0) {
    const pick = hyps.find((h) => h.id === hyp) ?? hyps[0];
    try {
      // 목록에만 실리는 값(screenSummary·canSendToBoard)은 상세에 없다 — 카드 값을 덮어 쓴다.
      const full = await api<BenchDetail>(`/hypotheses/${pick.id}`);
      bench = { ...full, ...pick, screenFindings: full.screenFindings,
                screenReview: full.screenReview };
    } catch {
      bench = pick as BenchDetail;   // 상세가 죽어도 대기줄과 머리글은 살린다
    }
  }

  // Board 층은 안건 대장이다 (08/31) — 여러 안건을 나란히 견준다.
  // 결정 기록은 목록 응답의 `boardSummary` 로 온다 (08/31) — 그전에는 결정 난 행마다
  // 상세를 한 번 더 불러 왕복이 행 수만큼 늘었다.
  let queued: typeof all = [];
  if (stage === "board") {
    // 상정할 수 있는가는 **서버가 판정한다** (`canSendToBoard` = 서명 + 상태).
    queued = all.filter((h) => h.canSendToBoard === true);
  }

  const empty = (
    <Panel tone="note" pad="lg" className="text-[0.9375rem] text-muted">
      {stage === "" ? (
        <>아직 임계를 넘은 조합이 없습니다 — 위 <b className="text-navy">[가설 도출하기]</b>를
          누르면 어느 관문에서 막혔는지 실측으로 보여드립니다. 판독이 아직이면{" "}
          <Link href="/pipeline" className="font-medium text-orange-deep">AI Readable 전환</Link>
          에서 구조화를 먼저 돌리세요.</>
      ) : (
        <>이 칸에 기다리는 가설이 없습니다.
        {" "}앞 단계에서 <b className="text-navy">보내기</b>를 누르면 여기 나타납니다.</>
      )}
    </Panel>
  );

  return (
    <>
      <Topbar
        title={view.title}
        right={
          <div className="flex items-center gap-2">
            {dev.length > 0 && <Chip tone="orange">{dev.length}건 · 전문조직 검토 경로</Chip>}
            {/* 가설층 리셋 (#108) — 리허설용. meta 는 이동 경로가 대신하므로 뺐다 (08/30 병합) */}
            <ResetLayer />
          </div>
        }
      />

      <div className="mx-auto max-w-6xl">
        <Eyebrow>{view.eyebrow}</Eyebrow>
        <h1 className="mt-2 text-[1.5rem] font-bold leading-[1.25] tracking-tight text-navy">
          {view.title}
        </h1>
        <p className="mt-1.5 max-w-[72ch] text-[0.9375rem] leading-[1.7] text-body">{view.desc}</p>

        {error && (
          <Panel tone="note" pad="lg" className="mt-5 text-[0.9375rem] text-rust">
            {error}
          </Panel>
        )}

        {!error && stage === "" && pipe && Object.keys(pipe.byStatus).length > 0 && <StageSummary pipe={pipe} />}

        {/* 08/28: 가설 도출을 **AI Readable 전환에서 여기로 옮겼다.** 이 화면의 빈 상태가
            "AI Readable 전환에서 … 먼저 돌리세요"라며 다른 화면으로 사람을 보내고 있었다 —
            자기 이름을 가진 행위를 하려고 왕복해야 했다. base 칸에만 둔다(Screen·Board 는
            작업 화면이고, 도출은 SENSE 의 일이다). */}
        {!error && stage === "" && <GenerateBar />}

        {!error && hyps.length === 0 && <div className="mt-6">{empty}</div>}

        {/* **칸을 가른다 (08/29 소정).** 임계를 넘었다고 곧 가설인 것은 아니다 —
            사람이 컨펌해야 선다. 한 목록에 섞어 두면 "아직 막혔다"는 카드가 가설로 읽힌다.
            없애지는 않는다: 08/27 에 DRAFT 만 보여줬다가 "Screen 으로 보내면 통째로
            사라진다"로 되돌린 기록이 있고, **컨펌할 자리가 같이 사라지기 때문**이다.
            임계 미달은 접어 둔다 — 허용 기준을 못 넘었으므로 가설 칸에 있으면 안 되지만,
            데이터가 쌓이면 올라올 것들이라 감추지도 않는다. */}
        {hyps.length > 0 && stage === "" && (() => {
          const below = (h: Hyp) => Boolean((h.aggregate ?? {}).belowThreshold);
          // **컨펌 대기는 DRAFT 뿐이다 (08/29 정정).** NOT_BOARD_READY 를 여기 넣었던 것은
          // 틀렸다 — 그건 이미 컨펌돼 Screen 까지 갔다가 **거기서 막힌** 것이지 아직 안
          // 올라간 것이 아니다. "아직 안 올라감"과 "올라갔다 막힘"은 다른 일이다.
          const waiting = hyps.filter((h) => !below(h) && h.status === "DRAFT");
          const standing = hyps.filter((h) => !below(h) && h.status !== "DRAFT");
          const watching = hyps.filter(below);
          return (
            <div className="mt-5 flex flex-col gap-6">
              {waiting.length > 0 && (
                <div>
                  <SectionHead title="컨펌 대기" dot="orange"
                    right={`${waiting.length}건 · 근거를 원문과 대조해 인정하면 가설이 섭니다`} />
                  <div className="mt-3 flex flex-col gap-3">
                    {waiting.map((h) => <HypReadCard key={h.id} h={h} />)}
                  </div>
                </div>
              )}
              {standing.length > 0 && (
                <div>
                  <SectionHead title="선 가설" dot="navy"
                    right={`${standing.length}건 · 사람이 인정해 올라간 것 — 지금 어느 층에 있는지는 카드가 말합니다`} />
                  <div className="mt-3 flex flex-col gap-3">
                    {standing.map((h) => <HypReadCard key={h.id} h={h} />)}
                  </div>
                </div>
              )}
              {watching.length > 0 && (
                <details className="rounded-xl border border-line bg-card px-4 py-3">
                  <summary className="cursor-pointer text-[0.875rem] text-muted">
                    임계 미달 · 관찰 중 {watching.length}건 —
                    반복 {THRESHOLD_KO.repeat}회 · 독립 의료진 {THRESHOLD_KO.hcp}인을 아직 못 넘었습니다
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    {watching.map((h) => <HypReadCard key={h.id} h={h} />)}
                  </div>
                </details>
              )}
            </div>
          );
        })()}

        {/* Screen 층 = 워크벤치 (08/31). Board 층은 아래 2열 카드 목록 그대로. */}
        {stage === "screen" && !error && <ScreenBench hyps={hyps} detail={bench} />}

        {stage === "board" && !error && (
          <AgendaLedger hyps={hyps} queued={queued}
                        byStatus={pipe?.byStatus ?? {}}
                        boardStages={pipe?.boardStages} />
        )}

        {/* 임계값은 «가설이 되기 전» 이야기다 — Sense 칸에만 선다. 조건이 없어서
            Screen·심의 화면 아래 절반이 이 패널이었다 (08/31 실측). */}
        {stage === "" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Panel pad="lg">
            <Eyebrow>임계 근접 — 아직 가설이 아닌 조합</Eyebrow>
            {/* 08/28 팀장 지적: 여기 두 줄이 **성격이 다른 숫자**였다.
                ① 「임계 근접」은 가설이 아니라 **조합**(환자군 × 신호)을 센다. 그것도
                   미달 조합 전부(8개)가 아니라 `n == 임계-1`, 즉 **반복이 정확히 1건
                   모자란** 것만 센다 — 지금은 가임기 여성 4건/3인 하나다(각본이 그렇게
                   심은 대조군).
                ② 「임계 통과 — 가설 DRAFT」는 **단계**를 센다. 그런데 그 DRAFT 가설은
                   34회/11인으로 임계를 한참 **넘긴** 것이라, 「임계값 미달」 패널 안에
                   임계를 넘은 가설이 들어앉아 있었다. 그래서 뺐다 — 단계는 위 목록과
                   좌측 배지가 이미 말한다.
                제목도 「임계값 미달 · 관찰 중」에서 바꿨다: 8개 중 1개만 세면서
                "미달 전부"를 약속하는 제목이었다. */}
            {strip ? (
              <div className="mt-3 flex flex-col gap-2">
                <Row
                  label="반복이 1건만 모자란 조합"
                  value={<b className="font-medium text-orange-deep">{strip.hypotheses.nearThreshold}</b>}
                />
              </div>
            ) : (
              <p className="mt-3 text-[0.875rem] text-muted">집계를 불러오지 못했습니다.</p>
            )}
            <p className="mono mt-2 text-[0.75rem] leading-[1.7] text-navy/40">
              {/* 규칙·문서 절 번호는 화면에서 뺀다 (08/31 용어 정리) — 내용만 남긴다.
                  근거: 절대 규칙 #3 예외 조항(docs/02 §5.6)·08/30 #115 개정. */}
              임계 판정은 <b className="font-medium text-navy">기각(REJECTED)만 빼고</b> 셉니다 —
              검증에 걸려 아직 사람이 보지 않은 행도 포함합니다.
              승인은 수집 시점에 찍히므로 「승인 대기」라는 뜻의 잠정이 아닙니다.
              임계는 반복 {THRESHOLD.repeat}회 이상 · 독립 의료진 {THRESHOLD.hcp}인 이상입니다.
            </p>
            <div className="mt-3">
              <Placeholder title="조합별 관찰 목록">
                환자군 × 신호 조합별로 임계에 얼마나 다가섰는지는 다음 판독 뒤에 채워집니다.
              </Placeholder>
            </div>
          </Panel>

          {/* 임계값은 backend/app/hypothesis_gen.py 의 THRESHOLD_* 가 정본이다 — 바꾸면 여기도 바꾼다 */}
          <Panel tone="navy" pad="lg">
            <Eyebrow onNavy>임계값 규칙</Eyebrow>
            <ul className="mt-3 flex flex-col gap-2 text-[0.9375rem] leading-[1.6] text-on-navy">
              <li>· 반복 3회 이상</li>
              <li>· 독립 의료진 3인 이상</li>
              <li>· 원문 포인터 검증 100%</li>
              <li>· 환자군이 지정된 조합만</li>
            </ul>
            <p className="mono mt-4 text-[0.8125rem] leading-[1.7] text-on-navy-3">
              조건을 모두 넘겨야 가설이 됩니다 · 결정론적 계산
            </p>
          </Panel>
        </div>
        )}
      </div>
    </>
  );
}
