/**
 * 안건 대장 — Board 층의 목록을 «카드 명부»에서 «여러 안건을 나란히 비교하는 표»로 바꾼다
 * (08/31 — 팀장 컨펌 완료).
 *
 * **왜 카드에서 표로.** Board 진입 전에 사람이 하는 판단은 «어느 안건이 지금 나를
 * 기다리나»다. 그건 본질적으로 **비교**인데, 2열 그리드 카드 스택은 안건을 세로로
 * 늘어놓기만 해서 비교가 안 됐다 — In-label 칸이 비면 화면의 절반이 «이 칸은 비어
 * 있습니다» 한 장으로 남는 것도 같은 원인이다.
 *
 * 08/31 Screen 층이 워크벤치(`ScreenBench`)가 된 것과 같은 진단이고, 처방만 다르다:
 * Screen 은 «한 건을 읽고 서명하는» 자리라 마스터–디테일이 맞았고, Board 진입 전은
 * «여러 건을 견주는» 자리라 표가 맞다. 한 건을 펴는 자리는 회의장(`/board/[hypId]`)이
 * 이미 맡고 있으므로 여기서 또 펴면 중복이다.
 *
 * **In-label / Development 2열 축은 사라지지 않는다** — 「구분」 열로 옮겼다.
 * 절대 규칙 #5(상업 액션 분리)를 화면이 증명하는 자리라 없앨 수 없고, 열로 옮기면
 * 오히려 안건마다 붙어 다닌다.
 *
 * ── 08/31 두 숫자를 서버로 옮겼다 (머지 전 조건) ─────────────────────────
 * 시안에서는 아래 둘을 화면이 셌고, 머리말이 «PR 전에 반드시 서버로 옮긴다»고 못
 * 박아 두었다. 옮겼다 — 숫자를 세는 주체가 화면이면 규칙이 아니라 표기만 남는다.
 *
 *   ① 「회의 소집 대기」/「결정 대기」 — `GET /hypotheses/pipeline` 의 `boardStages`.
 *      IN_REVIEW 를 회의록 EXISTS 로 가른 SQL 두 방이고, 둘의 합은 byStatus.IN_REVIEW 다.
 *   ② 결정 시각 — 목록 카드의 `boardSummary { decision, decidedAt }`.
 *      그전에는 결정 난 행마다 상세를 한 번 더 불러 왕복이 행 수만큼 늘었다(N+1).
 *      append-only 테이블의 MAX(id) 를 SQL 이 고른다 — «마지막이 지금의 결정»을
 *      화면이 배열 끝에서 집어내지 않는다.
 *
 * 표에 **싣지 않는 것**과 그 이유:
 *   · `stanceTally`·`recommendedDecision` — 파이썬 루프가 세면서 "SQL" 라벨을 단다
 *     (`deliberate.py:363-380`). 거짓 라벨이 N 행으로 번지는 경로를 막는다.
 *   · `decidedBy` — 08/28 확정 「의장 서명」 규약이라 값 자체는 정당하지만, 목록에서
 *     「승인 / CEO」로 나란히 놓이면 «Agent 에 승인 권한 없음»을 화면이 뒤집는 것처럼
 *     읽힌다. 저장된 값은 고쳐 쓰지 않는다 — 회의장 결정 이력이 정본이다.
 *   · `basisGate.approved` — 환자군 단위 집계라(`group_by(Claim.patient_segment)`)
 *     같은 환자군을 쓰는 가설 둘이 같은 숫자를 갖는데 열 라벨은 «이 안건의 근거»로 읽힌다.
 *   · 진행률 막대·LIVE 배지 — 회의 진행도는 라이브 스냅샷의 `phaseNo` 에만 있고 목록에는
 *     없다. **모르는 것을 깜빡이지 않는다.**
 *   · 회차·턴 수 (08/31 소정) — 「1차 · 26턴」이 무엇을 뜻하는지 읽히지 않는다. 안건의
 *     성질이 아니라 «몇 번 돌렸는가»의 흔적이고, 시뮬레이터로 반복 실행한 뒤에는 더 그렇다.
 *   · 「외부 지지」 (08/31 소정) — `support` 의 **부분집합**인데(EVIDENCE_* 에이전트분)
 *     「판정 8 / 외부 지지 4」로 나란히 놓아 둘의 관계가 읽히지 않았다. 겹치지 않는
 *     `support` / `counter` 두 수만 남긴다.
 *   · 「결정 버튼은 이 표에 없습니다 … 에이전트에게는 그 버튼이 없습니다」 각주 (08/31 소정)
 *     — 프로토타입에서 이 문장은 **회색으로 죽은 승인 버튼 옆**에 있었다. 버튼 없는 표
 *     밑으로 옮기니 아무도 묻지 않은 것을 해명하는 면책조항이 됐다. 그 메시지는 회의장의
 *     진짜 버튼 옆에서 해야 한다.
 */

import Link from "next/link";
import { Panel, Fold, Grade, Chip, TableFrame, TH, TD, BTN_ROW, BTN_ROW_NAVY } from "@/app/components/ui";
import HandoffBar from "./HandoffBar";

const cx = (...v: (string | false | null | undefined)[]) => v.filter(Boolean).join(" ");

export type Hyp = {
  id: string;
  titleKo: string;
  kind: "IN_LABEL" | "DEVELOPMENT";
  status: string;
  patientSegment: string;
  hasMinutes?: boolean;
  screenSummary?: { judgments: number; externalSupport: number; support: number; counter: number };
  evidenceReviewedBy?: string | null;
  evidenceReviewedAt?: string | null;
  canSendToBoard?: boolean;
  /** 결정 기록 — 목록 응답이 준다 (08/31). **회차·턴 수는 담지 않는다:** 「1차 · 26턴」은
      그 안건의 성질이 아니라 «몇 번 돌렸는가»의 흔적이고, 시뮬레이터로 반복 실행한
      뒤에는 특히 그렇다. 판단에 쓸 수 없는 숫자를 표에 두면 읽는 사람이 뜻을 찾느라 멈춘다. */
  boardSummary?: { decision: string; decidedAt: string };
  aggregate: { priority?: string } | null;
};

const GRADE: Record<string, "h" | "m" | "l"> = { HIGH: "h", MEDIUM: "m", LOW: "l" };

/* 상태 문구는 **새로 만들지 않는다** — PR #109 가 확정한 계약을 그대로 쓴다 (08/30).
   같은 상태를 두 화면이 다르게 부르면 어느 쪽이 맞는지 알 수 없다. */
const STATUS_KO: Record<string, string> = {
  IN_REVIEW: "심의 결론 · 승인 대기",
  APPROVED: "승인됨",
  HOLD: "보류",
  REJECTED: "반려됨",
};
const preMeeting = (h: Hyp) => h.status === "IN_REVIEW" && h.hasMinutes === false;
const statusKo = (h: Hyp) =>
  preMeeting(h) ? "상정됨 · 회의 소집 대기" : (STATUS_KO[h.status] ?? h.status);

/** 오렌지는 «사람이 결정할 차례» **하나만** 가리킨다 (08/30).
    소집 대기는 물들이지 않는다 — 둘 다 물들면 신호가 죽는다. */
const awaitingHuman = (h: Hyp) => h.status === "IN_REVIEW" && h.hasMinutes === true;

/** 행의 다음 걸음 — 장소가 아니라 **행위**를 말한다 (08/29). */
function nextStep(h: Hyp) {
  if (preMeeting(h)) return { label: "회의 소집하러 가기", navy: true };
  if (awaitingHuman(h)) return { label: "결정하러 가기", navy: true };
  return { label: "회의록 보기", navy: false };
}

/** `decisions.decided_at` 은 **UTC** 다 (실측 `2026-08-30T09:08:40.893305+00:00`).
    `convenedAtKst` 류와 처리가 다르다 — 그쪽은 +09:00 이 이미 붙은 문자열이라
    `Date` 로 파싱하면 서버 TZ 에 따라 흔들린다 (DECISIONS 08/28 UTC 사고). */
function kst(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((a, x) => (a[x.type] = x.value, a), {});
  return `${p.month}-${p.day} ${p.hour}:${p.minute} KST`;
}

export default function AgendaLedger({
  hyps, queued, byStatus, boardStages,
}: {
  /** board 칸에 서는 안건 (IN_REVIEW · APPROVED · HOLD · REJECTED) */
  hyps: Hyp[];
  /** 서명을 마쳐 상정할 수 있는 가설 — 표의 행이 아니라 예고다 */
  queued: Hyp[];
  /** 서버 SQL 집계 (`GET /hypotheses/pipeline` 의 byStatus) */
  byStatus: Record<string, number>;
  /** IN_REVIEW 를 회의록 유무로 가른 SQL 집계 (같은 응답의 boardStages) */
  boardStages?: { convening: number; awaitingDecision: number };
}) {
  // 전부 서버가 센 것을 그대로 쓴다 — 화면은 세지 않는다.
  const convening = boardStages?.convening ?? 0;
  const deciding = boardStages?.awaitingDecision ?? 0;
  const approved = byStatus.APPROVED ?? 0;
  const held = byStatus.HOLD ?? 0;
  const rejected = byStatus.REJECTED ?? 0;
  const axis = (byStatus.IN_REVIEW ?? 0) + approved + held + rejected;

  return (
    <>
      {/* 리드 한 줄 — 회의 동시 실행 가드가 **프로세스 전역 단일 플래그**라
          (deliberate.py:1060-1062) 여러 안건을 보여주면서 이 말이 없으면
          심사위원이 두 건을 동시에 소집하려다 409 를 맞는다. */}
      <p className="mt-2 text-[0.875rem] leading-[1.75] text-body">
        안건은 <b className="text-navy">한 번에 한 건씩</b> 심의됩니다 — 다른 안건의 회의가
        도는 중이면 소집이 거절됩니다.
      </p>

      {/* ── 현황 스트립 ─────────────────────────────────────────────── */}
      <Panel pad="md" className="mt-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <span className="mono text-[0.8125rem] text-muted">안건</span>
          <b className="tabular-nums text-[1.0625rem] font-bold leading-none text-navy">{axis}건</b>
          <span className="text-faint">·</span>
          <span className="text-[0.875rem] leading-none text-body">
            상정 대기 <b className="tabular-nums font-medium text-navy">{queued.length}</b>
          </span>
          <span className="text-[0.875rem] leading-none text-body">
            회의 소집 대기 <b className="tabular-nums font-medium text-navy">{convening}</b>
          </span>
          <span className="text-[0.875rem] leading-none text-body">
            결정 대기 <b className="tabular-nums font-medium text-orange-deep">{deciding}</b>
          </span>
          <span className="text-[0.875rem] leading-none text-body">
            승인 <b className="tabular-nums font-medium text-navy">{approved}</b>
            <span className="mx-1.5 text-faint">·</span>
            보류 <b className="tabular-nums font-medium text-navy">{held}</b>
            <span className="mx-1.5 text-faint">·</span>
            반려 <b className="tabular-nums font-medium text-navy">{rejected}</b>
          </span>
          {/* 이제 여섯 칸 전부 서버 집계다 — 라벨이 사실이 됐으므로 단다. */}
          <span className="mono ml-auto text-[0.75rem] text-faint">전부 서버 집계</span>
        </div>
      </Panel>

      {/* ── 곧 올라올 안건 — 조작 버튼 없는 예고. 상정의 정본은 검증 화면 카드다 ── */}
      {queued.length > 0 && (
        <Fold
          tone="quiet"
          title={`곧 올라올 안건 ${queued.length}건`}
          hint="서명이 끝나 안건으로 올릴 수 있습니다 — 상정은 검증 화면의 카드가 합니다"
        >
          <div className="mt-1 flex flex-col">
            {queued.map((h) => (
              <div key={h.id}
                   className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line py-2.5 first:border-t-0">
                <span className="mono text-[0.75rem] text-muted">{h.id}</span>
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-body">{h.titleKo}</span>
                {h.evidenceReviewedBy && (
                  <span className="mono text-[0.75rem] text-faint">
                    서명 {h.evidenceReviewedBy}
                    {h.evidenceReviewedAt ? ` · ${kst(h.evidenceReviewedAt)}` : ""}
                  </span>
                )}
                <Link href={`/hypotheses?stage=screen&hyp=${h.id}`}
                      className="mono text-[0.75rem] font-medium text-orange-deep underline underline-offset-[3px]">
                  검증 화면에서 상정 →
                </Link>
              </div>
            ))}
          </div>
        </Fold>
      )}

      {/* ── 안건 대장 ───────────────────────────────────────────────── */}
      {hyps.length === 0 ? (
        <Panel tone="note" pad="lg" className="mt-4 text-[0.9375rem] text-muted">
          <b className="text-navy">지금 이사회에 올라온 안건이 없습니다.</b>
          <div className="mt-1.5">
            {queued.length > 0 ? (
              <>
                <b className="text-navy">상정 대기 {queued.length}건</b>이 외부 근거 검토 서명을
                마치고 검증 화면에 서 있습니다.
              </>
            ) : (
              <>외부 근거 검토 서명을 마친 가설이 없습니다 —{" "}
                <b className="text-navy">그 서명이 심의행의 관문입니다.</b></>
            )}
          </div>
          <Link href="/hypotheses?stage=screen" className={cx(BTN_ROW, "mt-4 inline-block")}>
            다중 에이전트 검증에서 보기 →
          </Link>
        </Panel>
      ) : (
        <>
          <TableFrame className="mt-4">
            <thead>
              <tr>
                <th className={cx(TH, "w-[36%]")}>안건</th>
                <th className={cx(TH, "w-[10%]")}>구분</th>
                <th className={cx(TH, "w-[17%]")}>현황</th>
                <th className={cx(TH, "w-[14%] text-right")}>검토 결과</th>
                <th className={cx(TH, "w-[17%]")}>다음 걸음</th>
              </tr>
            </thead>
            <tbody>
              {hyps.map((h) => {
                const b = h.boardSummary;
                const step = nextStep(h);
                const hot = awaitingHuman(h);
                return (
                  <tr key={h.id} id={h.id} className={cx(hot && "bg-orange-soft")}>
                    <td className={TD}>
                      <div className="flex gap-2">
                        <span className="mt-[7px] shrink-0"><Grade level={GRADE[h.aggregate?.priority ?? "LOW"] ?? "l"} /></span>
                        <span className="min-w-0">
                          <span className="mono block text-[0.75rem] text-muted">{h.id}</span>
                          <b className="mt-0.5 block break-keep text-[0.875rem] leading-[1.45] text-navy">
                            {h.titleKo}
                          </b>
                          <span className="mono mt-1 block text-[0.75rem] text-faint">{h.patientSegment}</span>
                        </span>
                      </div>
                    </td>

                    <td className={TD}>
                      {h.kind === "DEVELOPMENT" ? (
                        <span title="미승인 적응증·환자군이라 상업 액션에 자동 연결되지 않습니다 (절대 규칙 #5).">
                          <Chip tone="orange">Development</Chip>
                        </span>
                      ) : (
                        <Chip>In-label</Chip>
                      )}
                    </td>

                    <td className={TD}>
                      <span title={h.status}
                            className={cx("mono block text-[0.75rem] font-medium",
                                          hot ? "text-orange-deep" : "text-muted")}>
                        {statusKo(h)}
                      </span>
                      {b?.decidedAt && (
                        <span className="mono mt-1 block text-[0.6875rem] text-faint">
                          결정 {kst(b.decidedAt)}
                        </span>
                      )}
                    </td>

                    {/* **지지 / 반대 2분법** (docs/04:421 — 08/27 회의에서 GAP 폐지).
                        전에는 「판정 8 / 외부 지지 4」였는데, 뒤가 앞의 **부분집합**인 것을
                        말하지 않고 나란히 놓아 둘의 차이가 읽히지 않았다 (08/31 소정).
                        서로 겹치지 않는 두 수만 남긴다 — 검토관들이 얼마나 밀었고 얼마나 막았나. */}
                    <td className={cx(TD, "mono whitespace-nowrap text-right tabular-nums")}
                        title="Screen 검토관 6인이 공개 근거와 대조해 남긴 판정입니다">
                      {h.screenSummary ? (
                        <span className="text-[0.8125rem] text-body">
                          지지 {h.screenSummary.support}
                          <span className="mx-1.5 text-faint">·</span>
                          반대 {h.screenSummary.counter}
                        </span>
                      ) : <span className="text-faint">—</span>}
                    </td>

                    <td className={TD}>
                      <Link href={`/board/${h.id}`} className={step.navy ? BTN_ROW_NAVY : BTN_ROW}>
                        {step.label}
                      </Link>
                      {h.status === "IN_REVIEW" && (
                        <div className="mt-2">
                          <HandoffBar id={h.id} status={h.status} canSendToBoard={h.canSendToBoard} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableFrame>
        </>
      )}
    </>
  );
}
