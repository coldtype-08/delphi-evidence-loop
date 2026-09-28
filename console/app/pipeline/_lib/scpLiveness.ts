/** SCP 승인 이력 중 **지금도 유효한 것**을 가른다 (08/27 — 팀장 지적).
 *
 * 화면이 "승인 28건"이라고 적었는데 활성 계약에 살아 있는 것은 16건이었다.
 * 표에 적힌 숫자 자체는 사실이다(proposals 테이블의 status 그대로) — 문제는
 * **승인 이력을 활성 계약으로 읽게 만든다**는 것이다. 두 갈래로 어긋난다:
 *
 *  - `SUPERSEDED` — 같은 (종류·대상·값)을 뒤에 다시 승인했다. 뒤 승인이 앞 판정을
 *    정정한 것이므로(허가범위 오판 되돌리기, docs/02 §7.6) 앞 것은 이미 뒤집혔다.
 *    실측 8건이 나란히 "승인됨"으로 있었다.
 *  - `REPLACED` — 승인됐지만 활성 계약에 그 필드 이름이 없다. 조립에서 고정 헤더에
 *    같은 뜻의 칸이 있어 대체됐다(이름이 겹치면 고정이 이긴다 — backend/CLAUDE.md).
 *    실측 4건: off_label_use_or_request · unmet_need_signal_trigger ·
 *    adverse_event_mention · patient_population_segment.
 *
 * 이력은 지우지 않는다 — 무엇이 언제 왜 바뀌었는지가 그 화면의 논지다.
 * **계약을 못 읽으면(activeFieldNames 없음) REPLACED 판정을 하지 않는다** — 모르는 것을
 * "무효"라고 부르면 화면이 거짓말을 한다.
 */
export type ScpLiveness = "LIVE" | "SUPERSEDED" | "REPLACED" | "REJECTED";

type Row = { kind: string; targetField: string; proposedValue: string; status: string };

/** 처리된(PROPOSED 아닌) 제안 목록을 **id 오름차순으로** 받아 같은 순서로 판정을 돌려준다. */
export function scpLiveness(
  done: readonly Row[],
  activeFieldNames: readonly string[] | null,
): ScpLiveness[] {
  const key = (r: Row) => `${r.kind} ${r.targetField} ${r.proposedValue}`;
  const lastApproved = new Map<string, number>();
  done.forEach((r, i) => { if (r.status === "APPROVED") lastApproved.set(key(r), i); });

  const names = activeFieldNames ? new Set(activeFieldNames) : null;
  return done.map((r, i) => {
    if (r.status !== "APPROVED") return "REJECTED";
    if (lastApproved.get(key(r)) !== i) return "SUPERSEDED";
    if (r.kind === "NEW_FIELD" && names && !names.has(r.targetField)) return "REPLACED";
    return "LIVE";
  });
}

export const SCP_LIVENESS_TAG: Record<ScpLiveness, { ko: string; cls: string; why: string }> = {
  LIVE:       { ko: "계약에 반영됨",    cls: "text-green", why: "지금 활성 계약에 살아 있습니다" },
  SUPERSEDED: { ko: "뒤에 정정됨",      cls: "text-muted", why: "같은 값을 나중에 다시 승인해 이 판정은 뒤집혔습니다 — 이력으로만 남습니다" },
  REPLACED:   { ko: "고정 헤더로 대체", cls: "text-muted", why: "승인됐지만 고정 헤더에 같은 뜻의 칸이 있어 조립에서 대체됐습니다 (이름이 겹치면 고정이 이깁니다)" },
  REJECTED:   { ko: "기각됨",          cls: "text-rust",  why: "심사에서 기각됐습니다" },
};
