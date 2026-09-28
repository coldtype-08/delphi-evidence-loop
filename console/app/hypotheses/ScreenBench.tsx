/**
 * 외부 근거 검토 워크벤치 — Screen 층의 목록을 «한 건씩 읽고 서명하는 자리»로 (08/31).
 *
 * 왼쪽은 대기줄, 오른쪽은 무대다. **선택은 URL(`?hyp=`)에 둔다** — 서버 컴포넌트가
 * 그대로 그릴 수 있고, 뒤로 가기와 새로고침이 저절로 동작하며, 링크로 특정 가설을 짚어
 * 보낼 수 있다. 클라이언트 상태로 두면 이 셋을 다 잃는다.
 *
 * 무대는 ScreenStage(클라이언트) 하나다 (08/31 시안 컨펌 — 릴레이 + 증언대):
 * 실행·폴링·서명·전이가 전부 그 안에 있고, 이 파일은 대기줄과 배치만 안다.
 * 층 구분은 그대로: Board 층(`?stage=board`)은 안건 대장을 쓴다.
 */

import Link from "next/link";
import { Panel, Chip } from "@/app/components/ui";
import ScreenStage, { type StageDetail } from "./ScreenStage";
import QueueRun from "./QueueRun";

type Summary = { judgments: number; externalSupport: number; support: number; counter: number };
type Hyp = {
  id: string;
  titleKo: string;
  kind: "IN_LABEL" | "DEVELOPMENT";
  status: string;
  notBoardReadyReason: string | null;
  driverSummaryKo: string | null;
  screenSummary?: Summary;
  evidenceReviewedBy?: string | null;
  evidenceReviewedAt?: string | null;
  evidenceReviewable?: boolean;
  canSendToBoard?: boolean;
  aggregate?: {
    claimCount?: number; distinctHcp?: number; distinctRegions?: number;
    recentCount?: number; priority?: string;
  } | null;
};

/** 이 가설의 Screen 현황 — 상태 하나로는 «서명 대기»와 «미실행»이 안 갈린다.
 *  rank 는 목록 정렬(08/31 피드백 #8): 지금 도는 것 → 사람을 기다리는 것 → 아직 안 돌린 것
 *  → 끝난 것. 명부가 아니라 **현황판**이므로 급한 순서가 위다. */
function queueState(h: Hyp): { ko: string; tone: string; rank: number } {
  if (h.status === "SCREENING") return { ko: "실행 중", tone: "text-orange-deep", rank: 0 };
  if (["DRAFT", "SCREEN_QUEUED"].includes(h.status)) return { ko: "미실행", tone: "text-faint", rank: 2 };
  if (h.evidenceReviewedAt) return { ko: "서명 완료", tone: "text-green", rank: 3 };
  return { ko: "검토 대기", tone: "text-orange-deep", rank: 1 };
}

/** 지지·반대 막대 + 수치 (08/31 — 색만으로는 몇 건인지 안 보였다).
 *  판정이 0이면 그리지 않는다 — 빈 막대는 «반반»으로 읽힌다. */
function Balance({ s, className = "" }: { s?: Summary; className?: string }) {
  const sup = s?.support ?? 0, con = s?.counter ?? 0;
  if (sup + con === 0) return null;
  return (
    <span className={`block ${className}`}>
      <span className="flex h-1 gap-[3px]" aria-hidden>
        <i className="block rounded-sm bg-green" style={{ flex: sup }} />
        <i className="block rounded-sm bg-rust" style={{ flex: con }} />
      </span>
      <span className="mono mt-0.5 flex justify-between text-[0.5rem]">
        <span className="text-green">지지 {sup}</span>
        <span className="text-rust">반대 {con}</span>
      </span>
    </span>
  );
}

function QueueItem({ h, active }: { h: Hyp; active: boolean }) {
  const st = queueState(h);
  const a = h.aggregate ?? {};
  return (
    <div className="relative">
    <Link
      href={`/hypotheses?stage=screen&hyp=${h.id}`}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`block rounded-xl border px-3 py-2.5 transition-colors ${
        active
          ? "border-orange bg-orange-soft/30 ring-2 ring-orange-soft"
          : "border-line bg-card hover:border-line-2 hover:bg-fill-1"
      } ${st.ko === "서명 완료" ? "opacity-70" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="mono text-[0.625rem] font-semibold text-navy">{h.id}</span>
        <span className={`mono ml-auto text-[0.5625rem] font-semibold ${st.tone}`}>{st.ko}</span>
      </div>
      <div className="mt-1 line-clamp-2 text-[0.6875rem] leading-[1.5] text-body">{h.titleKo}</div>
      <div className="mono mt-1.5 text-[0.5625rem] text-faint">
        {a.claimCount ?? "—"}회 · {a.distinctHcp ?? "—"}인 · {a.distinctRegions ?? "—"}권역
      </div>
      <Balance s={h.screenSummary} className="mt-1.5" />
    </Link>
    {/* 가설별 실행 — 미실행 카드에만. 실행 중·완료는 카드 라벨과 무대가 말한다 (08/31) */}
    {st.ko === "미실행" && <QueueRun hypId={h.id} />}
    </div>
  );
}

export default function ScreenBench({ hyps, detail }: { hyps: Hyp[]; detail: StageDetail | null }) {
  if (hyps.length === 0) {
    return (
      <Panel tone="note" pad="lg" className="mt-5 text-[0.875rem] text-muted">
        검증할 가설이 없습니다. 신호가 임계를 넘으면 여기에 올라옵니다.
      </Panel>
    );
  }
  // 현황판 정렬 — 급한 것이 위 (실행 중 → 검토 대기 → 미실행 → 서명 완료)
  const sorted = [...hyps].sort((x, y) => queueState(x).rank - queueState(y).rank);
  const countBy = (ko: string) => hyps.filter((h) => queueState(h).ko === ko).length;
  const strip: [string, number, "orange" | "green" | "plain"][] = [
    ["실행 중", countBy("실행 중"), "orange"],
    ["검토 대기", countBy("검토 대기"), "orange"],
    ["미실행", countBy("미실행"), "plain"],
    ["서명 완료", countBy("서명 완료"), "green"],
  ];

  return (
    <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <Panel pad="sm" className="flex flex-col gap-1.5 self-start">
        <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1">
          <span className="text-[0.75rem] font-medium text-body">Screen 현황</span>
          <span className="ml-auto flex flex-wrap justify-end gap-1">
            {strip.filter(([, n]) => n > 0).map(([ko, n, tone]) => (
              <Chip key={ko} tone={tone === "plain" ? undefined : tone}>{ko} {n}</Chip>
            ))}
          </span>
        </div>
        {sorted.map((h) => (
          <QueueItem key={h.id} h={h} active={h.id === detail?.id} />
        ))}
      </Panel>

      {detail
        ? <ScreenStage key={detail.id} initial={detail} />
        : <Panel tone="note" pad="lg" className="text-[0.875rem] text-muted">
            왼쪽에서 가설을 고르면 검토관이 모은 근거가 여기 열립니다.
          </Panel>}
    </div>
  );
}
