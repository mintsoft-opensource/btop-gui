# btop-gui

> [btop](https://github.com/aristocratos/btop)에서 영감을 받은 **크로스플랫폼 GUI 시스템 모니터**.
> macOS · Windows · Linux 데스크톱 앱 + 원격 서버용 경량 에이전트(WebSocket).

Apache-2.0 · 운영: MintSoft · btop 프로젝트와는 관련이 없는 독립 프로젝트입니다.

## 무엇을 보여 주나
- **CPU**: 전체 사용률 그래프, 코어별 막대, 로드, 클럭, 온도, 업타임
- **메모리**: 사용/가용/여유, 스왑, 사용률 그래프
- **디스크**: 마운트별 사용량, 읽기/쓰기 속도 그래프
- **네트워크**: 수신/송신 그래프, 인터페이스별 속도와 누적량
- **프로세스**: CPU·메모리·PID·이름·사용자·I/O 정렬, 검색, 트리 보기, 종료(SIGTERM / SIGKILL)
- **여러 호스트**: 내 컴퓨터와 원격 서버들을 탭으로 전환

## 구조
```
crates/core    # Rust 수집기(sysinfo) + 와이어 프로토콜 — 앱과 에이전트가 공유
crates/agent   # btop-gui-agent: 원격 서버에서 실행, ws://host:9100/ws 로 스냅샷 스트리밍
src-tauri      # Tauri 2 데스크톱 셸: 로컬 수집은 Tauri 이벤트로 전달
ui             # Next.js(정적 export) 화면 — 원격 호스트는 WebSocket으로 직접 연결
```

로컬 컴퓨터는 에이전트 없이 앱이 직접 수집합니다. 원격 서버는 에이전트를 띄우고 앱의 **+ HOST**로 추가합니다.

## 설치
[Releases](https://github.com/mintsoft-opensource/btop-gui/releases)에서 받습니다.

| OS | 앱 | 에이전트 |
|---|---|---|
| macOS (Apple Silicon / Intel) | `.dmg` | `btop-gui-agent-*-apple-darwin.tar.gz` |
| Windows | `.msi` / `-setup.exe` | `btop-gui-agent-*-windows-msvc.zip` |
| Linux | `.deb` / `.rpm` / `.AppImage` | `btop-gui-agent-*-linux-musl.tar.gz` (x86_64, aarch64) |

서명하지 않은 빌드라서 처음 실행할 때 경고가 뜹니다.
- macOS: `xattr -cr /Applications/btop-gui.app` 후 실행
- Windows: SmartScreen에서 **추가 정보 → 실행**

## 원격 에이전트
```bash
# 토큰 만들기
openssl rand -hex 24

# 실행 (기본 127.0.0.1:9100 — 외부에서 붙으려면 --bind 0.0.0.0:9100)
BTOP_GUI_TOKEN=<토큰> btop-gui-agent --bind 0.0.0.0:9100
```

| 옵션 | 환경 변수 | 기본값 | 설명 |
|---|---|---|---|
| `--bind` | `BTOP_GUI_BIND` | `127.0.0.1:9100` | 수신 주소 |
| `--token` | `BTOP_GUI_TOKEN` | (없으면 1회용 토큰 생성 후 로그 출력) | 접속 토큰 |
| `--interval-ms` | `BTOP_GUI_INTERVAL_MS` | `1000` | 수집 주기 (250~60000) |
| `--allow-kill` | `BTOP_GUI_ALLOW_KILL` | `false` | 원격 프로세스 종료 허용 |

### systemd (Linux)
```bash
sudo install -m 755 btop-gui-agent /usr/local/bin/
sudo install -m 644 btop-gui-agent.service /etc/systemd/system/
echo "BTOP_GUI_TOKEN=$(openssl rand -hex 24)
BTOP_GUI_BIND=0.0.0.0:9100" | sudo tee /etc/btop-gui-agent.env >/dev/null
sudo chmod 600 /etc/btop-gui-agent.env
sudo systemctl enable --now btop-gui-agent
```
유닛은 `DynamicUser=yes`로 권한 없는 사용자로 돌아갑니다. 다른 사용자의 프로세스까지 종료하려면 `--allow-kill`을 켜고 `DynamicUser`를 지워 root로 실행해야 합니다. 신중하게 결정하세요.

## 보안
- 연결 후 첫 메시지로 토큰을 보내야 하며, 틀리면 바로 끊깁니다. 토큰은 상수 시간으로 비교합니다.
- 원격 프로세스 종료는 기본으로 꺼져 있습니다. 켜더라도 PID 0·1과 에이전트 자신은 종료하지 않습니다.
- 통신은 평문 `ws://`입니다. 인터넷을 거친다면 리버스 프록시(TLS)로 `wss://`를 쓰거나 VPN/SSH 터널 안에서 사용하세요.
- 앱은 호스트 목록과 토큰을 앱 로컬 저장소(WebView localStorage)에 저장합니다.

## 개발
필요: Rust stable(1.90+), Node.js 22, [Tauri 사전 요구 사항](https://v2.tauri.app/start/prerequisites/)

```bash
npm ci && npm --prefix ui ci
npm run dev                        # 데스크톱 앱 (Next dev 서버 + Tauri)
npm --prefix ui run dev            # 브라우저에서 UI만 (원격 호스트만 표시)
cargo run -p btop-gui-agent -- --token dev --allow-kill
cargo test --workspace && npm --prefix ui test
npm run build                      # 현재 OS용 설치 파일
```

## 단축키
| 키 | 동작 |
|---|---|
| `/` | 프로세스 검색 |
| `t` | 트리 보기 전환 |
| `c` `m` `p` | CPU / 메모리 / PID 정렬 |
| `k` | 선택한 프로세스 종료 |
| `1`–`9` | 호스트 탭 전환 |
| `Esc` | 선택 해제 |

## 릴리스
`v*` 태그를 올리면 GitHub Actions가 macOS(arm64, x64)·Windows·Linux 앱과 에이전트 5종을 빌드해 릴리스에 올립니다.
```bash
git tag v0.1.0 && git push origin v0.1.0
```

## 라이선스
[Apache-2.0](LICENSE)
