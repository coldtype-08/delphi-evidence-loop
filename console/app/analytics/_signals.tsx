/**
 * 신호 유형의 이름·뜻·순서 — 홈과 분석 탭이 같은 것을 쓰게 하는 한 곳 (08/29).
 *
 * 왜 따로 빼나: 신호 지도가 홈으로 가고 격자가 분석 탭에 남으면서 **두 화면이 같은
 * 라벨과 같은 정의를 써야** 하게 됐다. 라우트 모듈(`page.tsx`)에서 서로 import 하면
 * 라우트가 라이브러리처럼 되므로 여기로 모은다.
 *
 * 라벨의 정본은 **계약(v1.8)의 `labelKo`** 다. 정의는 계약에 없어서
 * CLAUDE.md 의 고정 헤더 설명("허가 범위 밖 수요 / 써본 경험 / 다른 쓰임 / 안전성 /
 * 용량")을 한 줄로 풀어 쓴 것이다 — 지어낸 것이 아니다.
 */

import type { SignalCell } from "./_viz";

/** 계약의 정식 라벨. **화면의 기본은 이것이다.** */
export const SIGNAL_KO: Record<string, string> = {
  OFF_LABEL_DEMAND: "쓰고 싶은데 막혔다",
  OFF_LABEL_USE: "써봤다 · 반응 보고",
  REPURPOSING: "다른 쓰임",
  UNMET_NEED: "미충족 수요",
  DOSING: "용량 · 투여법",
  SAFETY_TOLERABILITY: "안전성 · 내약성",
  OTHER: "그 밖 (신호 아님)",
};

/** 칸이 좁을 때만 쓰는 줄임말.
 *  「막혔다」로 줄여 쓴 것이 08/29 팀장의 "막혔다는 게 뭔 말인겨"를 만들었다 —
 *  줄임말은 **자리가 없을 때의 차선**이지 기본이 아니다. */
export const SIGNAL_SHORT: Record<string, string> = {
  OFF_LABEL_DEMAND: "막혔다", OFF_LABEL_USE: "써봤다", REPURPOSING: "다른 쓰임",
  UNMET_NEED: "미충족 수요", DOSING: "용량·투여법", SAFETY_TOLERABILITY: "안전성·내약성",
};

/** 칸에 마우스를 올렸을 때 라벨과 같이 뜨는 한 줄 뜻. */
export const SIGNAL_DEF: Record<string, string> = {
  OFF_LABEL_DEMAND: "허가 밖이라 못 썼다 — 요구만 있고 처방은 없음",
  OFF_LABEL_USE: "허가 밖인데 실제로 썼고 그 반응을 보고함",
  REPURPOSING: "다른 질환·허가 적응증과 다른 쓰임에 쓸 수 있겠냐는 말",
  UNMET_NEED: "이 환자군은 쓸 약이 마땅치 않다는 말",
  DOSING: "증량 속도·용량 조정·병용에 관한 말",
  SAFETY_TOLERABILITY: "견딜 만한가에 관한 말 (부작용 의심은 별도 경로)",
};

/** 격자의 열 순서 — 규제상 중요한 축을 앞으로. 「써봤다」와 「막혔다」를 나란히 둔다. */
export const SIGNAL_ORDER = [
  { key: "OFF_LABEL_USE", ko: "써봤다" },
  { key: "OFF_LABEL_DEMAND", ko: "막혔다" },
  { key: "REPURPOSING", ko: "다른 쓰임" },
  { key: "UNMET_NEED", ko: "미충족 수요" },
  { key: "DOSING", ko: "용량·투여법" },
  { key: "SAFETY_TOLERABILITY", ko: "안전성·내약성" },
];

/** `/aggregates/signals` 의 행 중 도식이 쓰는 부분만. */
export type SigRow = {
  patientSegment: string; signalType: string; claimCount: number;
  provisional: { claimCount: number; distinctHcp: number };
};

/** 서버가 센 행 → 도식의 칸. **여기서 숫자를 만들지 않는다** (절대 규칙 #1) —
 *  이름을 붙이고 축 밖의 행(UNSPECIFIED·OTHER)을 걸러낼 뿐이다. */
export function toSignalCells(
  rows: SigRow[],
  segLabel: Record<string, string>,
  segScope: Record<string, string>,
): SignalCell[] {
  return rows
    .filter((r) => r.signalType !== "OTHER" && r.patientSegment !== "UNSPECIFIED"
                   && r.provisional.claimCount > 0 && segLabel[r.patientSegment])
    .map((r) => ({
      segment: r.patientSegment,
      segmentKo: (segLabel[r.patientSegment] ?? r.patientSegment).split(" (")[0],
      outOfLabel: segScope[r.patientSegment] === "OUT_OF_LABEL",
      signal: r.signalType,
      signalKo: SIGNAL_SHORT[r.signalType] ?? r.signalType,
      signalFull: SIGNAL_KO[r.signalType] ?? r.signalType,
      signalDef: SIGNAL_DEF[r.signalType] ?? "",
      count: r.provisional.claimCount,
      hcp: r.provisional.distinctHcp,
      official: r.claimCount,
    }));
}

/** 신호 지도·격자의 공통 범례 — 진하기가 무엇인지 말하지 않으면 그림이 안 읽힌다.
 *
 *  08/29: 「사람이 승인한 값이 있는 칸」과 「허가 밖 = Development」를 뺐다 (팀장).
 *  값 승인은 하지 않기로 한 흐름이라 승인 표시가 화면에 있을 이유가 없고,
 *  허가 범위는 「환자군 확장」의 표 한 곳에만 둔다 — 세 군데에 흩어져 있으면 헷갈린다. */
export function MatrixLegend() {
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="block h-[13px] w-[80px] rounded"
              style={{ background: "linear-gradient(90deg,rgba(22,38,97,.14),rgba(22,38,97,.8))" }} />
        진하기 = 독립 의료진 수
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="block size-[13px] rounded border border-dashed border-navy/40" />
        임계 미달 (3회 · 3인)
      </span>
    </div>
  );
}

/** 여섯 칸이 각각 무슨 말을 담는지 — 도식 **바로 아래** 붙는 띠 (08/29 팀장 요청).
 *  별도 용어 페이지로 빼면 아무도 안 본다. 그림 옆에 있어야 그림이 읽힌다. */
export function SignalGlossary() {
  return (
    <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-line bg-line
                    sm:grid-cols-2 xl:grid-cols-3">
      {/* 08/29 리디자인: 면색(bg-navy/[.025])을 걷었다 — 지도 바로 아래라 회색 벽돌
          여섯 장이 지도보다 먼저 보였다. 헤어라인만 남기면 «참고 줄»로 물러난다. */}
      {SIGNAL_ORDER.map((s) => (
        <div key={s.key} className="flex flex-col gap-0.5 bg-card px-3.5 py-2.5">
          <b className="text-[0.875rem] font-bold text-navy">{SIGNAL_KO[s.key]}</b>
          <span className="text-[0.8125rem] leading-[1.55] text-muted">{SIGNAL_DEF[s.key]}</span>
        </div>
      ))}
    </div>
  );
}
