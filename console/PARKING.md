# 보류 목록 (PARKING)

REFACTOR.md 작업 중 눈에 띈 것들. **고치지 않고 적어만 둔다** — A는 순수 이동, B는 순수 외형이고,
여기 적힌 것은 판단이 필요한 일이라 별도 작업으로 뺀다.

## A 단계에서 (08/26)

### 1. `pipeline/page.tsx` 가 200행 아래로 안 내려간다 — 1,718행

REFACTOR.md 는 15개 컴포넌트를 다 빼면 `page.tsx` 가 200행 아래가 될 것으로 봤다.
실제로는 **`PipelinePage` 자체가 1,630행**이다. 빠져나간 15개는 합계 ~1,680행이었고,
나머지가 전부 `PipelinePage` 의 몸통이다 (훅 71개 + 한 덩어리 JSX).

더 쪼개려면 JSX 구획을 새 컴포넌트로 **끊는 지점을 사람이 정하고** 그 구획이 읽는 상태를
props 로 내려야 한다 — 이름 있는 선언을 옮기는 것과 성질이 다른 일이고,
"로직을 한 줄도 바꾸지 않는다"는 A의 규칙 밖이다.

구획 후보 (page.tsx 의 주석 머리 그대로):
- ⓪ 데이터 로드 (584~)
- ① Contract 설계자 (760~) — 가장 크다. 확정 배너·전체 분할 독해·경로 점검 세 덩어리
- ①-보조 SCP 큐 (1142~) · 용어 사전 후보 (1184~)
- ② 구조화 (1289~)
- 원문 확대경 (1330~)
- AI Readable 데이터 표 (1551~)
- 실제 호출 기록 (1667~)

각 구획이 어떤 상태를 읽는지 먼저 뽑아야 props 설계가 나온다.

### 2. `StageStat` 을 `ui.tsx` 의 `Stat` 으로 흡수할지

`_panels/StageStat.tsx` 는 `ui.tsx` 의 `Stat` 과 이름만 같고 시그니처가 다르다
(`label/value/tone` vs `value/unit/label/note`). REFACTOR.md 지시대로 개명해 두었고,
흡수 여부는 B 단계 판단 사항으로 남긴다.

## B 단계에서 (08/26)

### 3. 손으로 쓴 유리 클래스가 남은 곳

B의 완료 조건은 `components/ui.tsx` 밖에서 `bg-card`·`border-line`·`bg-white/` 가
안 나오는 것이다. 아래는 프리미티브로 덮이지 않아 남겨둔 것들 —
`Panel`/`Row` 가 감당할 모양이 아니라서다.

- `contract/provenance/provenance-view.tsx` · `market/page.tsx` — **표 내부의 `border-line`**.
  행·열 경계선은 `Panel` 이 아니라 `<table>` 의 것이다. 표 프리미티브가 필요한지 판단이 남았다.
- `review/page.tsx` — 문서 목록의 **선택 가능한 버튼** 배경 (`bg-white/55` → 선택 시 오렌지).
  `Row` 는 정적 key–value 줄이고 이건 누를 수 있는 항목이다. `Panel` 에 `as="button"` 을
  줄지, 목록 항목 프리미티브를 따로 둘지 결정이 필요하다.
- `layout.tsx` 의 사이드바 유리 (`bg-white/50`) — 셸이다. 목업 값 그대로이고 한 곳뿐이다.

### 4. ~~`/pipeline` 은 B가 아직 안 들어갔다~~ — 08/26 완료

`_panels/*.tsx` 15개와 `page.tsx` 본문까지 프리미티브로 갈아끼웠고 Topbar 를 얹었다.
표·입력칸·행 버튼은 값이 여러 군데 필요해져 `ui.tsx` 에 정의를 두는 쪽으로 정했다
(`TableFrame`·`TH`·`TD`·`FIELD`·`BTN_ROW*`) — 3번의 "표 프리미티브가 필요한지"에 대한 답이다.

남은 것은 `_panels/FixedHeaderPanel.tsx` 하나 — 다른 세션이 만들고 있던 파일이라 손대지 않았다.

## 그 밖에

### 5. ~~`/pipeline` 상단 제목이 ContractBadge 와 겹친다~~ — 08/26 완료

`/pipeline` 에 `Topbar` 를 얹어 해결했다. `Topbar` 는 오른쪽에 배지 자리를 비워 둔다.

`Topbar` 가 없는 화면(`/contract/provenance`)은 아직 겹칠 수 있다 — 그 화면은 제목이
왼쪽에만 있어 지금은 부딪히지 않지만, 오른쪽에 뭘 놓으면 배지 밑으로 들어간다.

### 6. 셸 자체의 두 버그 (08/26 수정) — 재발하면 여기를 본다

- **Topbar 가 28px 떠 있었다**: `main` 의 `py-7` 이 `sticky top-0` 바를 밀어냈다.
  `-mt-7` 로 상쇄했으므로, `main` 의 세로 패딩을 바꾸면 `Topbar` 의 `-mt-7` 도 같이 바꿔야 한다.
- **로고가 사이드바를 넘어갔다**: 실물이 640×84 인데 `next/image` 에 110×29 로 선언돼 있었다.
  `h-19px` 로 그리면 폭이 145px 이라 `CONSOLE` 을 옆에 붙일 자리가 없다 — 세로로 쌓았다.

### 7. grid 항목의 min-width (08/26 수정)

`/contract/provenance` 가 1024px 에서 184px 넘쳤다. `grid` 항목은 기본이 `min-width: auto` 라서
안에 `min-w-[700px]` 표가 있으면 칸이 줄지 않고 화면을 밀어낸다. `[&>*]:min-w-0` 으로 막았다.
**표를 담는 grid 를 새로 만들 때마다 같은 함정이 있다.**
