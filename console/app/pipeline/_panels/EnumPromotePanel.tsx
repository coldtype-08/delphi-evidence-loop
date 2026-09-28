"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Btn } from "@/app/components/ui";

export default function EnumPromotePanel({ contractActive, onQueued }: {
  contractActive: boolean; onQueued: () => void;
}) {
  type FreeField = { key: string; labelKo: string; filledCount: number;
                     distinctValues: number; samples: string[] };
  type Proposed = { value: string; labelKo: string; coversKo: string; exampleQuote: string };
  const [fields, setFields] = useState<FreeField[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [proposed, setProposed] = useState<Proposed[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    if (fields) return;
    api<FreeField[]>("/contract/free-text-fields", { role: "DATA_STEWARD" })
      .then(setFields).catch(() => setFields([]));
  };

  const propose = async (key: string) => {
    setBusy("propose"); setErr(null); setProposed(null); setOpen(key);
    try {
      const out = await api<{ proposed: Proposed[]; noteKo: string; observedValues: number }>(
        "/contract/propose-enum", { method: "POST", role: "DATA_STEWARD",
                                    body: JSON.stringify({ field: key }) });
      setProposed(out.proposed);
      setPicked(new Set(out.proposed.map((v) => v.value)));
      setNote(`${out.observedValues}건의 서술을 읽고 ${out.proposed.length}개 제안 — ${out.noteKo}`);
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBusy(null); }
  };

  const adopt = async (key: string) => {
    if (!proposed) return;
    setBusy("adopt"); setErr(null);
    try {
      for (const v of proposed.filter((x) => picked.has(x.value))) {
        await api("/contract/proposals", {
          method: "POST", role: "DATA_STEWARD",
          body: JSON.stringify({
            kind: "NEW_ENUM_VALUE", targetField: key, proposedValue: v.value,
            rationaleKo: v.coversKo,
            impactNoteKo: "자유 서술 승격 — 승인 후 이 필드가 집계 대상이 됩니다 (08/26)",
            fieldSpec: { labelKo: v.labelKo },
          }),
        });
      }
      setNote(`SCP 큐에 ${picked.size}건 올렸습니다 — 아래 심사에서 승인하면 새 버전에 반영됩니다.`);
      setProposed(null); onQueued();
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBusy(null); }
  };

  const reclassify = async (key: string) => {
    setBusy("reclassify"); setErr(null);
    try {
      const out = await api<{ reclassified: number; skipped: number; noteKo: string }>(
        "/contract/reclassify", { method: "POST", role: "DATA_STEWARD",
                                  body: JSON.stringify({ field: key }) });
      setNote(`되짚기 완료 — ${out.reclassified}건 분류 · ${out.skipped}건은 애매해서 서술로 남김. ${out.noteKo}`);
      setFields(null); load();
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));
    } finally { setBusy(null); }
  };

  return (
    <details className="mt-2 w-full"
             onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) load(); }}>
      <summary className="cursor-pointer text-xs font-bold text-navy">
        자유 서술 → 분류값 승격 — 집계가 되게 만들기
      </summary>
      <p className="mt-2 text-[0.75rem] text-muted">
        허용값이 없는 필드는 뉘앙스를 그대로 담지만 <b className="text-ink">숫자로 셀 수 없습니다</b>.
        쌓인 서술을 읽어 분류값을 제안받고, 채택하면 SCP 심사를 거쳐 새 버전에 반영됩니다.
        승인 뒤 <b className="text-ink">[쌓인 서술 분류하기]</b>를 누르면 이미 쌓인 서술도 분류되어
        <b className="text-ink"> &ldquo;어느 환자군에서 몇 건&rdquo;</b>이 집계됩니다 (원 서술은 보존).
      </p>
      {err && <p className="mt-1 text-[0.75rem] font-bold text-rust">{err}</p>}
      {note && <p className="mt-1 rounded bg-green-soft px-2 py-1 text-[0.75rem] font-bold text-green">{note}</p>}
      {!fields ? (
        <p className="mt-2 text-xs text-muted">불러오는 중…</p>
      ) : fields.length === 0 ? (
        <p className="mt-2 text-xs text-muted">자유 서술이 쌓인 필드가 아직 없습니다.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {fields.map((f) => (
            <div key={f.key} className="rounded-xl border border-glass-line bg-card p-2 text-[0.75rem]">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-bold text-navy">{f.key}</code>
                <span className="text-ink">{f.labelKo}</span>
                <span className="text-muted">서술 {f.filledCount}건 · 서로 다른 값 {f.distinctValues}종</span>
                <Btn size="xs"  onClick={() => propose(f.key)} disabled={!!busy || !contractActive}
                        className={`ml-auto`}>
                  {busy === "propose" && open === f.key ? "읽는 중…" : "분류 기준 만들기"}
                </Btn>
                <Btn size="xs"  onClick={() => reclassify(f.key)} disabled={!!busy || !contractActive}
                        title="승인된 분류값으로 이미 쌓인 서술을 되짚습니다 — 원 서술은 보존됩니다"
                        >
                  {busy === "reclassify" ? "되짚는 중…" : "쌓인 서술 분류하기"}
                </Btn>
              </div>
              <p className="mt-1 text-muted">
                예: {f.samples.slice(0, 3).map((v) => `"${v.slice(0, 60)}"`).join(" · ")}
              </p>
              {open === f.key && proposed && proposed.length > 0 && (
                <div className="mt-2 rounded-xl border border-glass-line bg-card p-2">
                  <p className="mb-1 font-bold text-navy">제안된 분류값 — 채택할 것을 고르세요</p>
                  {proposed.map((v) => (
                    <label key={v.value} className="flex cursor-pointer items-start gap-1.5 py-0.5">
                      <input type="checkbox" checked={picked.has(v.value)}
                             onChange={() => setPicked((p) => {
                               const n = new Set(p);
                               if (n.has(v.value)) n.delete(v.value); else n.add(v.value);
                               return n;
                             })} />
                      <span>
                        <code className="font-bold text-navy">{v.value}</code>
                        <span className="ml-1 text-ink">{v.labelKo}</span>
                        <span className="block text-muted">{v.coversKo}</span>
                        {v.exampleQuote && (
                          <span className="block italic text-muted">예: &ldquo;{v.exampleQuote.slice(0, 90)}&rdquo;</span>
                        )}
                      </span>
                    </label>
                  ))}
                  <Btn size="xs" variant="primary"  onClick={() => adopt(f.key)} disabled={!!busy || picked.size === 0}
                          className={`mt-1`}>
                    {busy === "adopt" ? "올리는 중…" : `${picked.size}건 스키마 변경 심사에 올리기`}
                  </Btn>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
