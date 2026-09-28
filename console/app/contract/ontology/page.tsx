"use client";

/**
 * 온톨로지 (DATA CONTRACT) — 08/28 신설.
 *
 * **데이터는 이미 있었는데 화면이 없었다.** 배포본 실측: canonical 125개 · 표면형 164개 ·
 * STT 키워드 156개 · 미매핑 67종. 그런데 콘솔에서 이 사전을 볼 수 있는 곳은
 * `pipeline/page.tsx` 의 개수 배지 하나뿐이었고, `/analytics/unmapped`("구조 루프의 입구")는
 * 호출 0회였다. 등재 심사(후보) UI 만 있고 **확정된 사전 자체를 보는 자리가 없었다.**
 *
 * 왜 Data Contract 아래인가: docs/02 에서 §2 가 스키마(칸), §3 이 Controlled Vocabulary
 * (칸에 들어갈 말)로 **같은 문서의 형제**다. 스키마와 어휘는 한 계약의 두 면이다.
 *
 * 이 화면의 논지: docs/02 §3 이 *"영문 원석과 한국어 Field 수집이 같은 집계에 합산되는
 * 것 자체가 시연 포인트"* 라고 적어 두었고, docs/08 §2.1 의 AI Readable 5조건 중
 * ④ **언어 중립 canonical** 이 그것이다. 그 증거가 이 화면이다.
 */

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Panel, Eyebrow, Chip, Btn, Topbar, TabBar } from "@/app/components/ui";
import ContractTabs from "../tabs";
import ExternalTermsPanel from "@/app/pipeline/_panels/ExternalTermsPanel";

type Canon = { canonicalId: string; labelKo: string; surfaces: { EN?: string[]; KO?: string[] } };
type Vocab = { activeContractVersion: string; bySource: Record<string, number>;
               canonical: Canon[]; terms: { surface: string; lang: string; canonicalId: string }[];
               sttKeyterms: string[]; noteKo: string };
type Unmapped = { rows: { surfaceForm: string; occurrenceCount: number; firstSeenClaimId: string | null }[];
                  totalTerms: number; computedBy: string; noteKo: string };
type Prop = { id: number; surface: string; lang: string; canonicalId: string; labelKo: string;
              evidenceDocId: string; evidenceQuote: string; observedChunks: number;
              status: "PROPOSED" | "APPROVED" | "REJECTED"; decidedBy: string | null };

type Tab = "dict" | "unmapped" | "review" | "mesh";

export default function OntologyPage() {
  const [tab, setTab] = useState<Tab>("dict");
  const [v, setV] = useState<Vocab | null>(null);
  const [un, setUn] = useState<Unmapped | null>(null);
  const [props, setProps] = useState<Prop[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api<Vocab>("/field/vocab").then(setV)
      .catch((e) => setErr(e instanceof ApiError ? e.message : String(e)));
    api<Unmapped>("/analytics/unmapped?limit=100", { role: "DATA_STEWARD" }).then(setUn).catch(() => {});
    api<Prop[]>("/contract/vocab-proposals", { role: "DATA_STEWARD" }).then(setProps).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const decide = async (id: number, decision: "APPROVED" | "REJECTED") => {
    setBusy(id);
    try {
      await api(`/contract/vocab-proposals/${id}/decision`,
        { method: "POST", role: "DATA_STEWARD", body: JSON.stringify({ decision }) });
      load();
    } catch (e) { setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e)); }
    finally { setBusy(null); }
  };

  // 다국어 수렴이 보이는 것을 위로 — EN·KO 를 **둘 다** 가진 코드가 이 화면의 논지다
  const canon = v ? [...v.canonical].sort((a, b) => {
    const both = (c: Canon) => (c.surfaces.EN?.length ? 1 : 0) + (c.surfaces.KO?.length ? 1 : 0);
    return both(b) - both(a) || a.canonicalId.localeCompare(b.canonicalId);
  }) : [];
  const bothCount = canon.filter((c) => c.surfaces.EN?.length && c.surfaces.KO?.length).length;
  const open = props.filter((p) => p.status === "PROPOSED");

  return (
    <>
      <Topbar
        title="온톨로지"
        right={<Btn size="sm" onClick={load}>새로고침</Btn>}
      />

      <div className="mx-auto max-w-4xl">
        <Eyebrow>DATA CONTRACT</Eyebrow>
        <h1 className="mt-2 text-[1.5rem] font-bold leading-[1.25] tracking-tight text-navy">
          같은 뜻을 같은 코드로
        </h1>
        <p className="mt-1.5 max-w-[70ch] text-[0.9375rem] leading-[1.7] text-body">
          영어와 한국어 표현이 <b className="text-ink">하나의 코드로 수렴</b>합니다 — 그래서 영문 문서와
          한국어 현장 수집이 같은 집계에 합산됩니다.
        </p>

        <ContractTabs active="ontology" />

        <TabBar
          active={tab}
          onSelect={(id) => setTab(id as Tab)}
          items={[
            { id: "dict", label: "활성 사전", badge: v?.canonical.length },
            { id: "unmapped", label: "미매핑 대장", badge: un?.totalTerms },
            { id: "review", label: "등재 심사", badge: open.length || undefined },
            { id: "mesh", label: "MeSH 매핑" },
          ]}
        />

        {err && <Panel tone="note" pad="md" className="mt-4 text-[0.9375rem] text-rust">{err}</Panel>}

        {/* ── 활성 사전 ─────────────────────────────────────────────── */}
        {tab === "dict" && (v ? (
          <>
            <Panel as="section" pad="lg" className="mt-5">
              <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
                <div><Eyebrow>canonical 코드</Eyebrow>
                  <div className="mt-2 text-[2.6rem] font-bold leading-none tabular-nums tracking-tight text-navy">{v.canonical.length}</div></div>
                <div><Eyebrow>표면형</Eyebrow>
                  <div className="mt-2 text-[1.5rem] font-bold leading-none tabular-nums tracking-tight text-navy">{v.terms.length}</div></div>
                <div><Eyebrow>영·한 둘 다</Eyebrow>
                  <div className="mt-2 text-[1.5rem] font-bold leading-none tabular-nums tracking-tight text-green">{bothCount}</div></div>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  {Object.entries(v.bySource).map(([k, n]) => <Chip key={k}>{k} {n}</Chip>)}
                  <Chip>STT 키워드 {v.sttKeyterms.length}</Chip>
                </div>
              </div>
              <p className="mt-5 border-t border-line pt-3.5 text-xs leading-[1.7] text-muted">
                {v.noteKo} · 어느 경로든 <b className="text-ink">사람 승인 없이 사전에 들어가는 값은 없습니다.</b>
              </p>
            </Panel>

            <div className="mt-3 flex flex-col gap-1.5">
              {canon.map((c) => {
                const en = c.surfaces.EN ?? [], ko = c.surfaces.KO ?? [];
                const both = en.length > 0 && ko.length > 0;
                return (
                  <Panel key={c.canonicalId} pad="md" className={both ? "border-green/30" : undefined}>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <code className="mono text-[0.875rem] font-medium text-navy">{c.canonicalId}</code>
                      <span className="text-[0.875rem] text-body">{c.labelKo}</span>
                      {both && <span className="mono ml-auto text-[0.75rem] font-medium text-green">영·한 수렴</span>}
                    </div>
                    <div className="mt-2 flex flex-col gap-1 text-[0.8125rem]">
                      {en.length > 0 && (
                        <div className="flex gap-2">
                          <span className="mono w-6 shrink-0 text-faint">EN</span>
                          <span className="text-body">{en.map((s) => `“${s}”`).join(" · ")}</span>
                        </div>
                      )}
                      {ko.length > 0 && (
                        <div className="flex gap-2">
                          <span className="mono w-6 shrink-0 text-faint">KO</span>
                          <span className="text-body">{ko.map((s) => `“${s}”`).join(" · ")}</span>
                        </div>
                      )}
                    </div>
                  </Panel>
                );
              })}
            </div>
          </>
        ) : (
          <Panel pad="lg" className="mt-5 border-dashed">
            <p className="text-[0.9375rem] text-muted">사전을 불러오는 중입니다.</p>
          </Panel>
        ))}

        {/* ── 미매핑 대장 ───────────────────────────────────────────── */}
        {tab === "unmapped" && (
          !un || un.rows.length === 0 ? (
            <Panel pad="lg" className="mt-5">
              <p className="text-[0.9375rem] leading-[1.7] text-muted">
                스키마 밖 표현이 없습니다 — <b className="text-ink">비어 있는 것이 정상</b>입니다.
              </p>
            </Panel>
          ) : (
            <Panel as="section" pad="lg" className="mt-5">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <Eyebrow>구조 루프의 입구 — {un.totalTerms}종</Eyebrow>
                <span className="mono text-[0.75rem] text-faint">computedBy {un.computedBy}</span>
              </div>
              <p className="mt-2 max-w-[70ch] text-xs leading-[1.7] text-muted">
                {un.noteKo} 반복이 쌓인 표현은{" "}
                <a href="/contract/evolve" className="font-medium text-orange-deep underline underline-offset-2">변경 심사</a>
                로 올려 새 허용값이 됩니다.
              </p>
              <div className="mt-3.5 overflow-x-auto">
                <table className="w-full text-left text-[0.875rem]">
                  <thead>
                    <tr className="border-b border-line-2">
                      {["반복", "표현", "처음 나온 claim"].map((h) => (
                        <th key={h} className="bg-fill-1 px-3 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-faint">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {un.rows.map((r) => (
                      <tr key={r.surfaceForm} className="border-b border-line last:border-0">
                        <td className="mono px-3 py-2 tabular-nums font-medium text-navy">{r.occurrenceCount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-body">{r.surfaceForm}</td>
                        <td className="mono px-3 py-2 text-[0.75rem] text-faint">{r.firstSeenClaimId ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )
        )}

        {/* ── 등재 심사 ─────────────────────────────────────────────── */}
        {tab === "review" && (
          open.length === 0 ? (
            <Panel pad="lg" className="mt-5 border-dashed">
              <p className="text-[0.9375rem] leading-[1.7] text-muted">
                심사 대기 중인 용어 후보가 없습니다 — <b className="text-ink">AI Readable 전환</b>에서
                분할 독해가 완주하면 수확된 후보가 여기 올라옵니다.
              </p>
            </Panel>
          ) : (
            <Panel as="section" pad="lg" className="mt-5">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <Eyebrow>등재 심사 {open.length}건</Eyebrow>
                <span className="text-xs text-muted">
                  표면형이 <b className="text-ink">원문에 문자 그대로 있어야</b> 후보가 됩니다 — 서버가 대조합니다
                </span>
              </div>
              <div className="mt-3.5 flex flex-col gap-2.5">
                {open.map((p) => (
                  <div key={p.id} className="rounded-lg border border-line bg-card p-3.5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Chip>{p.lang}</Chip>
                      <span className="text-[0.9375rem] font-medium text-ink">“{p.surface}”</span>
                      <span className="text-faint">→</span>
                      <code className="mono text-[0.875rem] text-navy">{p.canonicalId}</code>
                      <span className="text-[0.875rem] text-muted">{p.labelKo}</span>
                      <span className="mono ml-auto text-[0.75rem] text-faint">{p.observedChunks}조에서 관찰</span>
                    </div>
                    <blockquote className="mt-2 border-l-2 border-orange pl-2.5 text-xs italic leading-[1.7] text-body">
                      “{p.evidenceQuote}” <span className="not-italic text-faint">— {p.evidenceDocId}</span>
                    </blockquote>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn variant="primary" size="sm" disabled={busy === p.id}
                           onClick={() => decide(p.id, "APPROVED")}>사전에 등재</Btn>
                      <Btn size="sm" className="!border-rust/40 !text-rust" disabled={busy === p.id}
                           onClick={() => decide(p.id, "REJECTED")}>기각</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )
        )}

        {/* ── MeSH 매핑 ─────────────────────────────────────────────── */}
        {tab === "mesh" && (
          <div className="mt-5">
            {/* 탭 맥락에서는 이 패널이 내용 전부다 — 접힌 채 시작하면 빈 화면으로 보인다 (08/30) */}
            <ExternalTermsPanel defaultOpen />
          </div>
        )}
      </div>
    </>
  );
}
