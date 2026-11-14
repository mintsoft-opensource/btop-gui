# btop-gui

btop에서 영감을 받은 크로스플랫폼(macOS·Windows·Linux) GUI 시스템 모니터. 공개 저장소: `mintsoft-opensource/btop-gui` (Apache-2.0).
사용자용 설명은 `README.md`, 이 파일은 개발 규칙과 함정만 둔다.

## 구조
| 경로 | 역할 |
|---|---|
| `crates/core` | `Collector`(sysinfo 0.38) → `Snapshot`, `kill(pid, force)`. GPU·배터리는 `hardware.rs` (macOS `ioreg`/`pmset`, Linux sysfs·`nvidia-smi`) |
| `src-tauri` | Tauri 2 셸. 수집 스레드가 `snapshot` 이벤트를 emit. 커맨드 `kill_process`, `set_interval`(250~60000ms) |
| `ui` | Next.js 16 정적 export(`ui/out`) + Tailwind CSS v4. 관제 화면 하나 |
| `.github/workflows` | `ci.yml`(푸시/PR), `release.yml`(`v*` 태그) |

원격 에이전트(WebSocket)는 0.0.1에서 제거했다. 필요하면 커밋 `0f16cdf`(제거 직전)에서 되살린다.

### 데이터 흐름
- `src-tauri/src/lib.rs` 스레드 → `Collector::sample()` → `emit("snapshot")` → `ui/lib/links.ts` `LocalLink`
- `LocalLink`가 그래프 히스토리(`MAX_HISTORY` 600개)와 프로세스별 추이(`PROCESS_HISTORY` 60개)를 보관. Rust는 현재 값만 보낸다.
- Rust `Snapshot` 필드는 camelCase로 직렬화된다. Rust 타입을 바꾸면 `ui/lib/types.ts`도 같이 바꾼다.

### UI
- `components/Monitor.tsx`: 상태 바(`StatusStrip`) + 지표 타일(`Tile`) 2×3 + 이벤트 로그 + 프로세스 목록. 타일 클릭/`1`–`6` → 상세 팝업(`CpuPanel` 등)
- `lib/alerts.ts`: 임계치 판정(`detectAlerts`)과 이벤트 로그(`diffAlerts`, 경고↔위험 흔들림·짧은 복귀는 기록 안 함)
- `lib/processes.ts`: APPS(`.app` 번들 기준 그룹)·LIST·TREE(서브트리 합계로 정렬)
- 색은 `globals.css`의 CSS 변수 → `@theme inline`으로 Tailwind 색(`text-phosphor`, `bg-panel` …). 테마(`data-theme`)·라이트/다크(`data-mode`)는 변수만 바꾼다
- 공용 UI 조각은 `components/ui.tsx`(`Panel`, `FocusPanel`, `Bar`, `button()`, `Dialog`)

## 명령
```bash
export PATH="$HOME/.cargo/bin:$PATH"     # 필수: Homebrew rustc(1.89)는 Tauri(1.90+ 요구)를 못 빌드
npm ci && npm --prefix ui ci
cargo test --workspace                   # Rust 9개 (collector 6, hardware 3)
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check                  # rustfmt.toml: max_width = 140
npm --prefix ui run typecheck && npm --prefix ui test   # vitest 22개
npm run dev                              # 앱 개발 모드 (Next dev :3456 + Tauri)
npx tauri build --bundles app            # macOS .app만 빠르게
```
- `src-tauri`는 컴파일 시 `ui/out`을 임베드한다. Rust만 빌드할 때도 `ui/out`이 있어야 한다 (`npm --prefix ui run build`).

## 규칙
- Rust 2024 edition, 들여쓰기 4칸(rustfmt). TS/TSX 2칸. 불필요한 주석 금지.
- 수집 로직은 `crates/core`에만 둔다.
- 새 순수 함수에는 테스트를 붙인다 (Rust `#[cfg(test)]`, UI `ui/lib/lib.test.ts`).
- PID 0·1·자기 자신은 `kill()`이 거부한다.
- 공개 저장소다. 내부 IP·호스트명·토큰·사용자 경로·실제 프로세스 목록이 보이는 스크린샷을 커밋하지 않는다.
- 버전은 `Cargo.toml`(workspace), `src-tauri/tauri.conf.json`, `package.json`, `ui/package.json` 네 곳(+ 두 `package-lock.json`의 루트 version)을 같이 올린다.
- UI 스타일은 Tailwind 유틸리티로 쓴다. `globals.css`에는 토큰과 복잡한 장식 배경(스캔라인·레이더·배경 격자)만 둔다.
- 단축키는 `lib/keys.ts`의 `shortcutKey`(물리 키 `event.code`)로 판정한다. 한글 입력 상태에서도 동작해야 한다.

## 함정
- **lockfile**: macOS의 npm 11로 만든 `ui/package-lock.json`에 Linux 전용 optional 패키지(`@emnapi/*`)가 빠져 CI `npm ci`가 실패한 적 있다. 의존성을 바꾸면 lockfile을 지우고 다시 만든 뒤 Linux에서 확인한다:
  `docker run --rm -v "$PWD/ui:/app" -w /app node:22 npm ci --ignore-scripts` (로컬 `node_modules`를 Linux용으로 덮으니 package.json·lock만 임시 폴더에 복사해서 돌린다)
  누락분만 채우려면 그 임시 폴더에서 `npm install --package-lock-only --ignore-scripts`. Tailwind v4(`@tailwindcss/oxide-wasm32-wasi`)도 `@emnapi/*`가 필요하다.
- **TypeScript는 5.x 고정**. 7.x(네이티브)는 Next 빌드와 맞지 않는다.
- **`next dev`가 `ui/AGENTS.md`를 생성/복구**한다. 커밋된 상태로 둔다.
- **CSP**(`tauri.conf.json`): 외부 폰트/스크립트·인라인 스크립트 금지 → 폰트는 `@fontsource`로 번들.
- **macOS 디스크**: `/System/Volumes/*`는 `/`와 같은 컨테이너라 숨긴다 (`visible_disk`).
- **Linux 스레드**: sysinfo가 스레드를 프로세스로 넣으므로 `thread_kind().is_some()`은 제외한다.
- **프로세스 CPU%**는 코어당 100% 기준(top 방식). 막대는 코어 수로 나눠 그린다.
- RTK 훅이 `vitest` 출력을 가린다. 결과가 안 보이면 `ui/.vitest/json/output.json`을 보거나 `rtk proxy npx vitest run`.
- 앱 창 스크린샷: `screencapture -l <windowId>`. 창 ID는 CGWindowList로 찾는다 (작은 숨은 창들이 같이 잡히니 860px 높이 창을 고른다).

## 릴리스
`git tag vX.Y.Z && git push origin vX.Y.Z` → `release.yml`:
1. `app`: tauri-action으로 macOS(arm64, x64)·Linux(deb/rpm/AppImage)·Windows(msi/nsis) 빌드 → **draft** 릴리스
2. `publish`: draft 해제
- 코드 서명 없음 (macOS `xattr -cr`, Windows SmartScreen 안내는 README).
- 이미 있는 태그를 다시 빌드: Actions에서 `release` 수동 실행(`tag` 입력).
