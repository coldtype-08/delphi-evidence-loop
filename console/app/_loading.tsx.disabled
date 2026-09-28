/**
 * 루트 로딩 스켈레톤 (08/29) — 서버 조회를 기다리는 동안 뼈대를 먼저 그린다.
 * docs/05 §7: 스켈레톤은 shimmer 없는 회색 블록, 스피너 금지. 면색은 fill-1/fill-2 만.
 *
 * ⚠ 루트 loading 은 **모든 라우트의 폴백**이다 (Next: page 와 children 전부를 Suspense 로
 * 감싼다). 그래서 홈 모양(KPI 격자·지도)을 그리면 다른 화면으로 갈 때 낯선 뼈대가
 * 떴다 사라진다 — **라우트 중립형**으로 둔다: 상단 바 자리 + 제목 줄 + 본문 블록 둘.
 */
export default function Loading() {
  return (
    <div role="status" className="mx-auto max-w-6xl pt-2">
      <span className="sr-only">불러오는 중</span>
      <div className="h-4 w-40 rounded bg-fill-1 motion-safe:animate-pulse" />
      <div className="mt-8 h-7 w-72 rounded-md bg-fill-2 motion-safe:animate-pulse" />
      <div className="mt-3 h-4 w-96 max-w-full rounded-md bg-fill-1 motion-safe:animate-pulse" />
      <div className="mt-10 h-40 rounded-2xl bg-fill-1 motion-safe:animate-pulse" />
      <div className="mt-6 h-72 rounded-2xl bg-fill-1 motion-safe:animate-pulse" />
    </div>
  );
}
