"use client";

/**
 * 가설 도출 — 08/28 신설. **AI Readable 전환에서 옮겨왔다.**
 *
 * 왜 옮겼나: 이 화면(신호와 가설)의 빈 상태가 *"AI Readable 전환에서 구조화와 가설
 * 도출을 먼저 돌리세요"* 라며 **다른 화면으로 사람을 보내고 있었다.** 자기 이름을 가진
 * 행위를 하려고 왕복해야 했다 — /hypotheses 비었음 → /pipeline 가서 도출 → 다시 돌아옴.
 *
 * docs/01 §3 이 *"신호와 가설은 다른 것이다"* 라며 두 단계로 가른다:
 *   ① 신호(SQL)  — 임계를 넘은 조합. 코드가 센다
 *   ② 가설(에이전트) — 신호 전체를 한 번에 읽고 검증 가능한 문장으로. 숫자는 한 자도 안 쓴다
 * **신호를 가설로 바꾸는 버튼은 그 이름을 가진 화면에 있어야 한다.**
 *
 * 카드는 옮기지 않았다 — 이 화면에 이미 HypCard 가 있고, 옮기면 구현이 둘이 된다.
 * 옮긴 것은 **도출 버튼 · 결과 요약 · 「왜 0건인가」 관문 진단 · 임계 근처** 넷이다.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Panel, Eyebrow, Btn, Grade } from "@/app/components/ui";

type Strength = { signalId: string; segment: string; signalType: string;
                  claimCount: number; distinctHcp: number };
type GenOut = {
  evaluatedCombos: number; passedCombos: number; created: string[]; updated: string[];
  thresholds: { repeat: number; distinctHcp: number; noteKo: string }; asOf: string;
  retired?: string[]; weakened?: string[]; nearMiss?: Strength[];
  // 에이전트가 몇 개를 써서 몇 개가 버려졌는지 (08/27 서버 신설 · 08/31 화면 노출) —
  // "임계 통과 15"에서 끊기면 묶임(설계)과 유실(버그)이 구분되지 않는다 (오류 #5)
  agentReport?: { agentWrote: number; accepted: number;
                  rejected: { titleKo: string; reasonKo: string }[] };
  diagnosis?: {
    computedBy: "SQL"; axes: { segment: string; signal: string }; autoSignals: string[];
    gates: { key: string; labelKo: string; count: number; hintKo: string }[];
    leakedSignals: { value: string; count: number }[];
  };
};

const hhmmss = (iso: string) =>
  new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export default function GenerateBar() {
  const router = useRouter();
  const [gen, setGen] = useState<GenOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // refresh=true — 응답 캐시를 무시하고 에이전트에게 다시 묻는다 (08/27 사고 대응).
  // 빈 결과가 캐시에 박히면 몇 번을 눌러도 0원으로 "가설 없음"이 재생됐다.
  const run = async (reask = false) => {
    setBusy(true); setErr(null);
    try {
      setGen(await api<GenOut>(`/hypotheses/generate${reask ? "?refresh=true" : ""}`, { method: "POST" }));
      router.refresh();   // 서버 컴포넌트가 그린 카드 목록을 다시 읽는다
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBusy(false); }
  };

  return (
    <Panel as="section" pad="lg" className="mt-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>신호 → 가설</Eyebrow>
          <p className="mt-2 max-w-[68ch] text-[0.875rem] leading-[1.7] text-body">
            임계를 넘은 조합에서 <b className="text-ink">검증 가능한 문장</b>을 세웁니다 —
            숫자는 코드가 세고 문장은 에이전트가 씁니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="primary" size="sm" disabled={busy} onClick={() => run(false)}
               title="임계를 넘은 신호에서 가설을 세웁니다 (1회 호출 · 캐시면 0원)">
            {busy ? "평가 중…" : "가설 도출하기"}
          </Btn>
          <Btn size="sm" disabled={busy} onClick={() => run(true)}
               title="응답 캐시를 무시하고 에이전트에게 다시 묻습니다. 같은 신호에 결과가 안 나올 때 쓰세요 (실호출 1회)">
            다시 묻기
          </Btn>
        </div>
      </div>

      <details className="group mt-2.5">
        <summary className="mono inline-flex cursor-pointer list-none items-center gap-1.5 text-[0.75rem] text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange">
          <span aria-hidden>▶</span>신호와 가설은 어떻게 갈리나
        </summary>
        <ol className="mt-2.5 flex flex-col gap-2 text-xs leading-[1.75] text-muted">
          <li>
            <b className="text-ink">① 신호 (SQL만)</b> — 환자군 × 신호 유형 조합이 반복 5회 이상이고
            독립 의료진 3인 이상이면 신호가 됩니다. 강도는 반복·의료진·권역·문서 수에
            최근 90일 비중까지 함께 셉니다.
          </li>
          <li>
            <b className="text-ink">② 가설 (에이전트)</b> — 신호 전체를 한 번에 읽고 검증 가능한 문장으로
            옮깁니다. 같은 이야기인 신호는 묶고, 섞여 있으면 나누고, 세울 게 없으면 비웁니다.
            <b className="text-ink"> 숫자는 한 자도 쓰지 않습니다</b> — 카드의 수치는 근거 신호들의 SQL
            합산이고, 근거 신호가 없는 가설은 저장되지 않습니다.
          </li>
          <li>
            집계는 <b className="text-ink">기각(REJECTED)만 뺀 전건</b>입니다 — 검증에 걸려 아직
            사람이 보지 않은 행도 셉니다. &ldquo;공식 집계는 APPROVED만&rdquo; 규칙의 유일한 명시적
            예외이고, 환자군 미상은 가설의 주체가 되지 않습니다. 기각으로 숫자가 움직인 뒤에는
            다시 도출합니다.
          </li>
        </ol>
      </details>

      {err && <p className="mono mt-3 text-[0.8125rem] text-rust">{err}</p>}

      {gen && (
        <Panel tone="inset" pad="sm" className="mono mt-3 text-[0.8125rem] leading-[1.7] text-muted">
          {/* **조합과 가설은 1:1이 아니다** — 에이전트가 같은 이야기를 묶는다(설계).
              그래서 흐름으로 찍는다: 통과 조합 → 에이전트 작성 → 검증 수용. 이 셋의
              간극이 "묶임·반려"로 설명되지 않을 때가 진짜 버그다 (오류 #5). */}
          평가 조합 {gen.evaluatedCombos} → 임계 통과{" "}
          <b className="font-medium text-orange-deep">{gen.passedCombos}</b>
          {gen.agentReport && (
            <>
              {" "}→ 에이전트 작성 {gen.agentReport.agentWrote}
              {" "}→ 가설 수용 <b className="font-medium text-navy">{gen.agentReport.accepted}</b>
            </>
          )}
          {" "}(신규 {gen.created.length} · 갱신 {gen.updated.length}
          {gen.agentReport && gen.passedCombos > gen.agentReport.agentWrote &&
            <> · 같은 이야기로 묶임 {gen.passedCombos - gen.agentReport.agentWrote}</>}
          {gen.agentReport && gen.agentReport.rejected.length > 0 &&
            <> · <b className="font-medium text-rust">반려 {gen.agentReport.rejected.length}</b></>}
          ) · SQL 계산 · {hhmmss(gen.asOf)}
        </Panel>
      )}

      {/* 반려는 사유까지 편다 — 조용히 사라진 가설이 없다는 것을 화면이 증명한다 (08/31) */}
      {gen?.agentReport && gen.agentReport.rejected.length > 0 && (
        <Panel tone="note" pad="sm" className="mt-2">
          <p className="text-[0.8125rem] font-medium text-rust">검증에서 반려된 문장 {gen.agentReport.rejected.length}건</p>
          <ul className="mt-1 flex flex-col gap-1">
            {gen.agentReport.rejected.map((r, i) => (
              <li key={i} className="text-[0.8125rem] leading-[1.6] text-body">
                {r.titleKo ? <b className="text-ink">{r.titleKo}</b> : "(제목 없음)"}
                <span className="text-muted"> — {r.reasonKo}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* 0건일 때 **왜 없는지**를 말한다 (08/26). "아직 없습니다"만 보여주면 판독을 안 돌린
          것인지, 미분류인지, 신호가 집계 대상 밖인지 구분할 수 없다. */}
      {gen?.diagnosis && (
        <Panel tone="note" pad="md" className="mt-3">
          <Eyebrow>왜 0건인가 · 관문별 실측 (SQL)</Eyebrow>
          <ol className="mt-2.5 flex flex-col gap-1.5">
            {gen.diagnosis.gates.map((g, i, all) => {
              const prev = i === 0 ? null : all[i - 1].count;
              const lost = prev !== null && prev > g.count;
              return (
                <li key={g.key} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[0.875rem]">
                  <Grade level={g.count === 0 ? "l" : lost ? "m" : "h"} />
                  <span className="text-body">{g.labelKo}</span>
                  <b className="mono font-medium tabular-nums text-navy">{g.count.toLocaleString()}건</b>
                  {lost && (
                    <span className="mono text-[0.75rem] text-rust">
                      −{(prev - g.count).toLocaleString()} 여기서 빠짐
                    </span>
                  )}
                  <span className="w-full pl-4 text-[0.8125rem] leading-[1.6] text-faint">{g.hintKo}</span>
                </li>
              );
            })}
          </ol>
          {gen.diagnosis.leakedSignals.length > 0 && (
            <p className="mt-3 border-t border-line pt-2.5 text-[0.8125rem] leading-[1.7] text-body">
              집계 대상 밖으로 간 신호 —{" "}
              {gen.diagnosis.leakedSignals.map((l, i) => (
                <span key={l.value}>
                  {i > 0 && " · "}
                  <code className="mono text-[0.8125rem]">{l.value}</code>{" "}
                  <span className="mono tabular-nums">{l.count}</span>건
                </span>
              ))}
              . 이 값들은 계약의 임계 대상{" "}
              <span className="mono text-[0.8125rem]">({gen.diagnosis.autoSignals.join(" · ") || "없음"})</span>
              에 없어 세지 않습니다 — <b className="text-ink">변경 심사</b>의 신호값 쏠림 점검에서
              표적 재분류할 수 있습니다.
            </p>
          )}
        </Panel>
      )}

      {/* 임계에 못 미친 조합 — "조금만 더 모이면 되는 것"이 보여야 다음 수집을 겨냥할 수 있다 */}
      {gen?.nearMiss && gen.nearMiss.length > 0 && (
        <Panel tone="inset" pad="sm" className="mt-3">
          <Eyebrow>임계 근처 — 아직 가설이 아닌 조합</Eyebrow>
          <ul className="mt-2 flex flex-col gap-1">
            {gen.nearMiss.map((n) => (
              <li key={n.signalId} className="mono flex flex-wrap items-baseline gap-x-2 text-[0.8125rem] text-muted">
                <Grade level={n.claimCount >= gen.thresholds.repeat ? "m" : "l"} />
                <code className="text-body">{n.segment}</code> ×{" "}
                <code className="text-body">{n.signalType}</code>
                <span className="tabular-nums">{n.claimCount}회 / 의료진 {n.distinctHcp}인</span>
                <span className="text-faint">
                  (임계 {gen.thresholds.repeat}회 · {gen.thresholds.distinctHcp}인)
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </Panel>
  );
}
