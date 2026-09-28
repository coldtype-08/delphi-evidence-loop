"use client";

/**
 * 변경 심사 (DATA CONTRACT) — 08/28 신설.
 *
 * 여기 있는 것은 전부 **AI Readable 전환 화면에서 옮겨온 것**이다. 그 화면은
 * ⓪ 파싱 → ① 스키마 확정 → ② 구조화 라는 **한 번의 라인**을 걸어가는 자리인데,
 * 스키마 변경 심사와 구조 루프 도구는 그 걸음이 아니다 — **계약을 고치는 일**이고
 * 드물게 돈다(코퍼스 전체에서 몇 건). 순서 안에 끼어 있으면 "지금 이걸 해야 하나"로
 * 읽힌다. 계약을 고치는 일은 전부 Data Contract 아래로 모은다.
 *
 * 상태를 pipeline 페이지에서 끌어오지 않고 **자기 데이터를 직접 조회**한다 —
 * 화면 하나가 자기 데이터를 갖는 것이 화면 사이 결합을 만들지 않는 유일한 방법이다.
 */

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Panel, Eyebrow, Chip, Btn, Confirm, Topbar } from "@/app/components/ui";
import ContractTabs from "../tabs";
import { scpLiveness, SCP_LIVENESS_TAG } from "@/app/pipeline/_lib/scpLiveness";
import SegmentGapPanel from "@/app/pipeline/_panels/SegmentGapPanel";
import EnumPromotePanel from "@/app/pipeline/_panels/EnumPromotePanel";
import SignalAuditPanel from "@/app/pipeline/_panels/SignalAuditPanel";

type ScpRow = { id: number; kind: string; targetField: string; proposedValue: string;
                rationaleKo: string; status: string };
type ContractSt = { version: string | null; status: string; locked?: boolean };
type Contract = { version: string; fields: Record<string, unknown> };

const KIND_KO: Record<string, string> = {
  NEW_FIELD: "새 필드", NEW_VALUE: "허용값 추가", RELABEL: "라벨 정정",
  LABEL_SCOPE: "허가 범위 판정 정정", NEW_TERM: "용어 등재",
};

export default function EvolvePage() {
  const [rows, setRows] = useState<ScpRow[]>([]);
  const [st, setSt] = useState<ContractSt | null>(null);
  const [fields, setFields] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  // 되돌릴 수 없는 행위는 확인을 받는다 (08/27 규칙) — 승인 즉시 새 계약 버전이 활성화된다
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(() => {
    api<ScpRow[]>("/contract/proposals", { role: "DATA_STEWARD" }).then(setRows)
      .catch((e) => setErr(e instanceof ApiError ? e.message : String(e)));
    api<ContractSt>("/contract/status").then(setSt).catch(() => {});
    // 활성 계약의 필드 이름 — 승인 이력 중 "지금도 유효한 것"을 가르는 데 쓴다.
    // 못 읽으면 null 로 둔다 (모르는 것을 "무효"라고 부르지 않는다 — scpLiveness 주석)
    api<Contract>("/contract/active").then((c) => setFields(Object.keys(c.fields))).catch(() => setFields(null));
  }, []);
  useEffect(load, [load]);

  const decide = async (id: number, decision: "APPROVED" | "REJECTED") => {
    setBusy(id); setErr(null);
    try {
      const out = await api<{ newVersion?: string; noteKo?: string }>(
        `/contract/proposals/${id}/decision`,
        { method: "POST", role: "DATA_STEWARD", body: JSON.stringify({ decision }) });
      setNote(out.noteKo ?? null);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBusy(null); }
  };

  const locked = !!st?.locked;
  const none = st?.status === "NONE";
  const open = rows.filter((r) => r.status === "PROPOSED");
  const done = rows.filter((r) => r.status !== "PROPOSED").sort((a, b) => a.id - b.id);
  const live = scpLiveness(done, fields);

  return (
    <>
      <Topbar
        title="변경 심사"
        right={<Btn size="sm" onClick={load}>새로고침</Btn>}
      />

      <div className="mx-auto max-w-4xl">
        <Eyebrow>DATA CONTRACT</Eyebrow>
        <h1 className="mt-2 text-[1.5rem] font-bold leading-[1.25] tracking-tight text-navy">
          스키마가 데이터를 보고 자란다
        </h1>
        <p className="mt-1.5 max-w-[70ch] text-[0.9375rem] leading-[1.7] text-body">
          스키마 변경은 <b className="text-ink">반드시 이 관문을 지납니다</b> — AI는 제안만 하고, 사람이 승인하고, 버전으로 남습니다.
        </p>
        <details className="group mt-2">
          <summary className="mono inline-flex cursor-pointer list-none items-center gap-1.5 text-[0.75rem] text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange">
            <span aria-hidden>▶</span>왜 이 관문이 필요한가
          </summary>
          <p className="mt-2 max-w-[70ch] text-xs leading-[1.75] text-muted">
            이 시스템이 내는 숫자(&ldquo;청소년에서 65회 반복&rdquo;)가 의미를 가지려면{" "}
            <b className="text-ink">&ldquo;청소년&rdquo;이 무엇을 뜻하는지가 고정</b>돼 있어야 합니다.
            구조가 조용히 바뀌면 어제 65회가 오늘 20회여도{" "}
            <b className="text-ink">데이터가 바뀐 건지 정의가 바뀐 건지 알 수 없습니다.</b>{" "}
            승인하면 새 버전이 활성화되고 Field 입력 폼이 즉시 바뀝니다. 과거 데이터는
            생성 당시 버전을 보존합니다.
          </p>
        </details>

        <ContractTabs active="evolve" />

        {locked && (
          <Panel tone="note" pad="md" className="mt-4 border-rust/30 bg-rust-soft">
            <p className="text-[0.875rem] leading-[1.7] text-ink">
              <b className="text-rust">확정된 스키마를 지키려고 잠가 두었습니다.</b>{" "}
              승인·기각·재분류가 전부 막힙니다. 읽기는 그대로 됩니다.
            </p>
          </Panel>
        )}
        {err && <Panel tone="note" pad="md" className="mt-4 text-[0.9375rem] text-rust">{err}</Panel>}
        {note && <Panel pad="md" className="mt-4 border-green/30 bg-green-soft text-[0.9375rem] font-medium text-green">{note}</Panel>}

        {/* ── 심사 대기 ─────────────────────────────────────────────── */}
        <Panel as="section" pad="lg" className="mt-5">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <Eyebrow>심사 대기</Eyebrow>
            {open.length > 0 && <Chip tone="orange">{open.length}건</Chip>}
          </div>

          {none ? (
            <p className="mt-3.5 text-[0.9375rem] leading-[1.7] text-muted">
              아직 확정된 계약이 없습니다 — <b className="text-ink">AI Readable 전환</b>에서 v1.0을 확정하면 이 관문이 열립니다.
            </p>
          ) : open.length === 0 ? (
            <p className="mt-3.5 text-[0.9375rem] leading-[1.7] text-muted">
              심사 대기 중인 제안이 없습니다. 아래{" "}
              <b className="text-ink">구조 루프 도구</b>에서 후보를 만들면 여기 올라옵니다.
            </p>
          ) : (
            <div className="mt-3.5 flex flex-col gap-2.5">
              {open.map((r) => (
                <div key={r.id} className="rounded-lg border border-line bg-card p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip>{KIND_KO[r.kind] ?? r.kind}</Chip>
                    <code className="mono text-[0.875rem] font-medium text-navy">{r.targetField}</code>
                    <span className="text-faint">→</span>
                    <code className="mono text-[0.875rem] text-ink">{r.proposedValue}</code>
                  </div>
                  <p className="mt-2 text-[0.875rem] leading-[1.7] text-muted">{r.rationaleKo}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Btn variant="primary" size="sm"
                         disabled={locked || busy === r.id}
                         onClick={() => setConfirmId(r.id)}>승인 — 새 버전 발행</Btn>
                    <Btn size="sm" className="!border-rust/40 !text-rust"
                         disabled={locked || busy === r.id}
                         onClick={() => decide(r.id, "REJECTED")}>기각</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ── 처리된 이력 ───────────────────────────────────────────── */}
        {done.length > 0 && (
          <Panel as="section" pad="lg" className="mt-3">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <Eyebrow>처리된 이력 {done.length}건</Eyebrow>
              <span className="text-xs text-muted">
                이력은 지우지 않습니다 — 무엇이 언제 왜 바뀌었는지가 이 화면의 논지입니다
              </span>
            </div>
            <div className="mt-3.5 flex flex-col gap-1.5">
              {done.map((r, i) => {
                const tag = SCP_LIVENESS_TAG[live[i]];
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-line py-1.5 text-[0.875rem] last:border-0">
                    <span className="mono text-[0.75rem] text-faint">#{r.id}</span>
                    <span className="text-muted">{KIND_KO[r.kind] ?? r.kind}</span>
                    <code className="mono text-navy">{r.targetField}</code>
                    <code className="mono text-muted">{r.proposedValue}</code>
                    <span title={tag.why} className={`mono ml-auto text-[0.75rem] font-medium ${tag.cls}`}>
                      {tag.ko}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* ── 구조 루프 도구 — 후보를 만드는 자리 ────────────────────── */}
        <Panel as="section" pad="lg" className="mt-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <Eyebrow>구조 루프 도구</Eyebrow>
            <span className="text-xs text-muted">드물게 도는 것이 정상입니다</span>
          </div>
          <p className="mt-2 max-w-[70ch] text-xs leading-[1.7] text-muted">
            판독이 끝난 뒤에야 재료가 생깁니다(미분류·자유 서술·쏠린 신호값). 후보를 만들어
            위 <b className="text-ink">심사 대기</b>에 올리면 새 계약 버전이 되고, 다시 판독하면 그때부터 집계에 잡힙니다.
          </p>
          <div className="mt-4 space-y-3">
            <SegmentGapPanel contractActive={!none} onQueued={load} />
            <EnumPromotePanel contractActive={!none} onQueued={load} />
            <SignalAuditPanel contractActive={!none} onDone={load} />
          </div>
        </Panel>
        <Confirm
          open={confirmId !== null}
          title="승인하면 새 계약 버전이 즉시 활성화됩니다"
          detail="Field 입력 폼과 집계 컬럼이 곧바로 새 스키마를 따릅니다. 과거 데이터는 생성 당시 버전을 보존합니다. 되돌릴 수 없습니다."
          confirmLabel="승인 — 새 버전 발행"
          onConfirm={() => { const id = confirmId; setConfirmId(null); if (id !== null) decide(id, "APPROVED"); }}
          onCancel={() => setConfirmId(null)}
        />
      </div>
    </>
  );
}
