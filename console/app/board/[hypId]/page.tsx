import BoardRoom from "./BoardRoom";

/** 회의장 서버 셸 — 데이터·연출은 전부 클라이언트(BoardRoom)가 한다.
 *  Next 16: params는 Promise — await로 푼다 (AGENTS.md · dist/docs 03-layouts-and-pages).
 */

export const dynamic = "force-dynamic";

export default async function BoardRoomPage({
  params,
}: {
  params: Promise<{ hypId: string }>;
}) {
  const { hypId } = await params;
  return <BoardRoom hypId={hypId} />;
}
