"use client";

/**
 * 가설층 리셋 (08/30) — "보드까지 올라간 상태"를 가설 생성 직전으로 되돌리는 버튼.
 *
 * 지우는 것: 가설·Screen 판정·회의록·의장 판정·Action Item (전부 hypothesis_id에 딸린 것).
 * 지키는 것: 문서·claim(승인 도장 포함)·안전성 후보·계약·호출 기록.
 * 리허설용이다 — 같은 데이터에서 가설→Screen→Board를 몇 번이고 다시 밟는다.
 *
 * 흐름은 서버의 dryRun 계획을 먼저 보여주고 확인받는다 (contract-prune과 같은 원칙).
 * 의장 판정(사람 기록)은 재실행으로 복원되지 않으므로, 있으면 체크박스로 한 번 더 묻는다.
 * 숫자는 전부 서버 SQL 카운트다 — 이 컴포넌트는 받아서 보여주기만 한다 (절대 규칙 #1).
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiError } from "@/lib/api";
import { Btn, Confirm } from "@/app/components/ui";

type Plan = {
  dryRun: boolean;
  wouldDelete: { hypotheses: number; hypothesesByStatus: Record<string, number>;
    screenFindings: number; boardMinutes: number; decisions: number; actionItems: number };
  kept: { documents: number; claims: number; approvedClaims: number; safetyCandidates: number };
  decisionsPresent: number;
};

export default function ResetLayer() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [dropDecisions, setDropDecisions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const preview = async () => {
    setBusy(true); setErr(null); setDropDecisions(false);
    try {
      setPlan(await api<Plan>("/system/reset-hypotheses",
        { method: "POST", body: JSON.stringify({ dryRun: true }) }));
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
      setPlan(null);
    } finally { setBusy(false); }
  };

  const run = async () => {
    if (!plan) return;
    if (plan.decisionsPresent > 0 && !dropDecisions) {
      setErr("의장 판정을 지우는 데 동의해야 실행됩니다 — 아래 확인을 체크하세요.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      // 리셋은 **비우기만** 한다 (08/30 확정 — 옵션도 두지 않는다). 처음엔 자동 재생성
      // 옵션이 있었는데, 같은 데이터면 같은 가설이 즉시 다시 서서 두 번이나 "리셋이 안
      // 된다"로 읽혔다. 다시 세우는 버튼([가설 도출하기])이 같은 화면에 이미 있다.
      await api("/system/reset-hypotheses", {
        method: "POST",
        body: JSON.stringify({ dryRun: false, regenerate: false, dropDecisions }),
      });
      // 배지·목록이 전부 이 층의 숫자를 본다 — 이벤트를 쏘고 서버 컴포넌트를 새로 그린다
      window.dispatchEvent(new Event("delphi:pipeline-changed"));
      window.location.reload();
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
      setBusy(false);
    }
  };

  const d = plan?.wouldDelete;
  return (
    <>
      <Btn size="sm" onClick={preview} disabled={busy}
           title="가설·Screen 판정·회의록만 지우고 가설 생성부터 다시 — 문서·claim·승인은 그대로">
        {busy && !plan ? "확인 중…" : "가설층 리셋"}
      </Btn>
      {/* 버튼은 Topbar 안에 살지만 다이얼로그는 body로 낸다 — Topbar의 backdrop-blur가
          fixed 요소의 기준 상자가 되어(containing block) 모달이 58px 띠 안에 갇힌다. */}
      {plan !== null && createPortal(<Confirm
        open={plan !== null}
        title="가설층을 비우고 가설 생성부터 다시 밟습니다"
        confirmLabel={busy ? "실행 중…" : "가설층 비우기"}
        onCancel={() => { setPlan(null); setErr(null); }}
        onConfirm={run}
        detail={plan && d && (
          <div className="flex flex-col gap-2.5">
            <div>
              <p className="font-medium text-navy">지워지는 것</p>
              <p className="mono mt-1 text-[0.75rem] leading-[1.8] text-body">
                가설 {d.hypotheses}건
                {Object.keys(d.hypothesesByStatus).length > 0 &&
                  ` (${Object.entries(d.hypothesesByStatus).map(([s, n]) => `${s} ${n}`).join(" · ")})`}
                <br />Screen 판정 {d.screenFindings}행 · 회의록 {d.boardMinutes}행 ·
                의장 판정 {d.decisions}건 · Action Item {d.actionItems}건
              </p>
            </div>
            <div>
              <p className="font-medium text-navy">그대로 남는 것</p>
              <p className="mono mt-1 text-[0.75rem] leading-[1.8] text-body">
                문서 {plan.kept.documents.toLocaleString()} ·
                claim {plan.kept.claims.toLocaleString()}
                (승인 {plan.kept.approvedClaims} 포함) ·
                안전성 후보 {plan.kept.safetyCandidates} · 계약·호출 기록 전부
              </p>
            </div>
            {plan.decisionsPresent > 0 && (
              <label className="flex items-start gap-2 rounded-lg border border-rust/30 bg-rust-soft px-3 py-2 text-[0.8125rem] leading-[1.6] text-rust">
                <input type="checkbox" className="mt-1" checked={dropDecisions}
                       onChange={(e) => setDropDecisions(e.target.checked)} />
                <span>의장 판정 <b>{plan.decisionsPresent}건</b>도 지웁니다 — 사람의 기록이라
                  재실행으로 복원되지 않습니다.</span>
              </label>
            )}
            <p className="text-[0.75rem] leading-[1.7] text-muted">
              비우기만 합니다 — 실행 후 빈 보드에서 <b className="font-medium text-body">[가설 도출하기]</b>를
              눌러 처음부터 다시 밟습니다. 회의록·Screen 판정은 재실행 시 캐시 재생으로 복원됩니다.
            </p>
            {err && <p className="mono text-[0.75rem] leading-[1.7] text-rust">{err}</p>}
          </div>
        )}
      />, document.body)}
      {/* 미리보기 자체가 실패한 경우 — 다이얼로그 없이 인라인으로 */}
      {err && plan === null && (
        <span className="mono ml-2 text-[0.6875rem] text-rust">{err}</span>
      )}
    </>
  );
}
