# btop-gui

btop에서 영감을 받은 크로스플랫폼(macOS·Windows·Linux) GUI 시스템 모니터. 공개 저장소: `mintsoft-opensource/btop-gui` (Apache-2.0).
사용자용 설명은 `README.md`, 이 파일은 개발 규칙과 함정만 둔다.

## 구조
| 경로 | 역할 |
|---|---|
| `crates/core` | `Collector`(sysinfo 0.38) → `Snapshot`, `kill(pid, force)`, 와이어 프로토콜(`ClientMessage`/`ServerMessage`). 앱과 에이전트가 공유 |
| `crates/agent` | `btop-gui-agent` 바이너리. axum WebSocket `/ws`, `/health`. lib(`router`/`serve`) + `main.rs`(clap) |
| `src-tauri` | Tauri 2 셸. 1초마다 로컬 `Snapshot`을 `snapshot` 이벤트로 emit, `kill_process` 커맨드 |
| `ui` | Next.js 16 정적 export(`ui/out`). 로컬은 Tauri 이벤트, 원격은 브라우저 WebSocket |
| `deploy/btop-gui-agent.service` | systemd 유닛 (`DynamicUser=yes`) |
| `.github/workflows` | `ci.yml`(푸시/PR), `release.yml`(`v*` 태그) |

### 데이터 흐름
- **로컬**: `src-tauri/src/lib.rs` 스레드 → `Collector::sample()` → `emit("snapshot")` → `ui/lib/links.ts` `LocalLink`
- **원격**: 에이전트 샘플러 스레드 → `watch` 채널(직렬화된 JSON) → 세션별 전송 → `RemoteLink`
- 에이전트는 **접속한 클라이언트가 없으면 수집하지 않는다** (`clients` 카운터).
- 히스토리(그래프)는 UI가 링크별로 120개 보관 (`ui/lib/history.ts`). 서버는 현재 값만 보낸다.

### 프로토콜 (v1, `crates/core/src/protocol.rs`)
- 클라이언트 → `{"type":"hello","token"}` (연결 후 5초 안에 첫 메시지), `{"type":"kill","pid","force"}`
- 서버 → `welcome{protocol,version,allowKill}`, `snapshot{data}`, `killResult{pid,ok,message}`, `error{message}`
- 필드는 camelCase. Rust 타입을 바꾸면 `ui/lib/types.ts`도 같이 바꾼다. 호환이 깨지면 `PROTOCOL_VERSION`을 올린다.

## 명령
```bash
export PATH="$HOME/.cargo/bin:$PATH"     # 필수: Homebrew rustc(1.89)는 Tauri(1.90+ 요구)를 못 빌드
npm ci && npm --prefix ui ci
cargo test --workspace                   # Rust 12개 (core 8, agent 단위 2 + WS 통합 2)
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check                  # rustfmt.toml: max_width = 140
npm --prefix ui run typecheck && npm --prefix ui test   # vitest 8개
npm run dev                              # 앱 개발 모드 (Next dev :3456 + Tauri)
npm --prefix ui run dev                  # 브라우저에서 UI만 (로컬 탭 없음, 원격만)
cargo run -p btop-gui-agent -- --token dev --allow-kill
npx tauri build --bundles app            # macOS .app만 빠르게
```
- `src-tauri`는 컴파일 시 `ui/out`을 임베드한다. Rust만 빌드할 때도 `ui/out`이 있어야 한다 (`npm --prefix ui run build`).

## 규칙
- Rust 2024 edition, 들여쓰기 4칸(rustfmt). TS/TSX 2칸. 불필요한 주석 금지.
- 수집 로직은 `crates/core`에만 둔다. 앱·에이전트에 중복 구현 금지.
- 새 순수 함수에는 테스트를 붙인다 (Rust `#[cfg(test)]`, UI `ui/lib/lib.test.ts`).
- 원격 kill은 기본 비활성. 기본값을 위험한 쪽으로 바꾸지 않는다. PID 0·1·자기 자신은 `kill()`이 거부한다.
- 공개 저장소다. 내부 IP·호스트명·토큰·사용자 경로·실제 프로세스 목록이 보이는 스크린샷을 커밋하지 않는다.
- 버전은 `Cargo.toml`(workspace), `src-tauri/tauri.conf.json`, `package.json`, `ui/package.json` 네 곳을 같이 올린다.

## 함정
- **lockfile**: macOS의 npm 11로 만든 `ui/package-lock.json`에 Linux 전용 optional 패키지(`@emnapi/*`)가 빠져 CI `npm ci`가 실패한 적 있다. 의존성을 바꾸면 lockfile을 지우고 다시 만든 뒤 Linux에서 확인한다:
  `docker run --rm -v "$PWD/ui:/app" -w /app node:22 npm ci --ignore-scripts`
- **TypeScript는 5.x 고정**. 7.x(네이티브)는 Next 빌드와 맞지 않는다.
- **`next dev`가 `ui/AGENTS.md`를 생성/복구**한다. 커밋된 상태로 둔다.
- **CSP**(`tauri.conf.json`): `connect-src`에 `ws: wss:`가 있어야 원격 연결이 된다. 외부 폰트/스크립트는 금지 → 폰트는 `@fontsource`로 번들.
- **macOS 디스크**: `/System/Volumes/*`는 `/`와 같은 컨테이너라 숨긴다 (`visible_disk`).
- **Linux 스레드**: sysinfo가 스레드를 프로세스로 넣으므로 `thread_kind().is_some()`은 제외한다.
- **프로세스 CPU%**는 코어당 100% 기준(top 방식). 막대는 코어 수로 나눠 그린다.
- RTK 훅이 `vitest` 출력을 가린다. 결과가 안 보이면 `ui/.vitest/json/output.json`을 보거나 `rtk proxy npx vitest run`.
- 앱 창 스크린샷: `screencapture -l <windowId>`. 창 ID는 CGWindowList로 찾는다 (작은 숨은 창들이 같이 잡히니 860px 높이 창을 고른다).

## 릴리스
`git tag vX.Y.Z && git push origin vX.Y.Z` → `release.yml`:
1. `app`: tauri-action으로 macOS(arm64, x64)·Linux(deb/rpm/AppImage)·Windows(msi/nsis) 빌드 → **draft** 릴리스
2. `agent`: linux-musl(x64, arm64)·macOS 2종·Windows 바이너리를 tar.gz/zip으로 업로드
3. `publish`: draft 해제
- 코드 서명 없음 (macOS `xattr -cr`, Windows SmartScreen 안내는 README).
- 이미 있는 태그를 다시 빌드: Actions에서 `release` 수동 실행(`tag` 입력).
