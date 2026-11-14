# btop-gui

> A **cross-platform GUI system monitor** inspired by [btop](https://github.com/aristocratos/btop).
> Desktop app for macOS · Windows · Linux, plus a lightweight agent (WebSocket) for remote servers.

Apache-2.0 · Maintained by MintSoft · An independent project, not affiliated with btop.

## What it shows
- **CPU**: total usage graph, per-core bars, load, clock, temperature, uptime
- **Memory**: used/available/free, swap, usage graph
- **Disk**: usage per mount, read/write throughput graphs
- **Network**: receive/transmit graphs, per-interface rates and totals
- **Processes**: sort by CPU · memory · PID · name · user · I/O, search, tree view, kill (SIGTERM / SIGKILL)
- **Multiple hosts**: switch between your machine and remote servers with tabs

## Layout
```
crates/core    # Rust collector (sysinfo) + wire protocol — shared by the app and the agent
crates/agent   # btop-gui-agent: runs on remote servers, streams snapshots over ws://host:9100/ws
src-tauri      # Tauri 2 desktop shell: local metrics are delivered via Tauri events
ui             # Next.js (static export) frontend — connects to remote hosts directly over WebSocket
```

The local machine is collected directly by the app, no agent needed. For remote servers, start the agent and add it with **+ HOST** in the app.

## Install
Download from [Releases](https://github.com/mintsoft-opensource/btop-gui/releases).

| OS | App | Agent |
|---|---|---|
| macOS (Apple Silicon / Intel) | `.dmg` | `btop-gui-agent-*-apple-darwin.tar.gz` |
| Windows | `.msi` / `-setup.exe` | `btop-gui-agent-*-windows-msvc.zip` |
| Linux | `.deb` / `.rpm` / `.AppImage` | `btop-gui-agent-*-linux-musl.tar.gz` (x86_64, aarch64) |

Builds are unsigned, so you will see a warning on first launch.
- macOS: run `xattr -cr /Applications/btop-gui.app`, then launch
- Windows: in SmartScreen, click **More info → Run anyway**

## Remote agent
```bash
# Generate a token
openssl rand -hex 24

# Run (defaults to 127.0.0.1:9100 — use --bind 0.0.0.0:9100 to accept external connections)
BTOP_GUI_TOKEN=<token> btop-gui-agent --bind 0.0.0.0:9100
```

| Option | Env var | Default | Description |
|---|---|---|---|
| `--bind` | `BTOP_GUI_BIND` | `127.0.0.1:9100` | Listen address |
| `--token` | `BTOP_GUI_TOKEN` | (if unset, a one-time token is generated and logged) | Access token |
| `--interval-ms` | `BTOP_GUI_INTERVAL_MS` | `1000` | Sampling interval (250–60000) |
| `--allow-kill` | `BTOP_GUI_ALLOW_KILL` | `false` | Allow killing processes remotely |

### systemd (Linux)
```bash
sudo install -m 755 btop-gui-agent /usr/local/bin/
sudo install -m 644 btop-gui-agent.service /etc/systemd/system/
echo "BTOP_GUI_TOKEN=$(openssl rand -hex 24)
BTOP_GUI_BIND=0.0.0.0:9100" | sudo tee /etc/btop-gui-agent.env >/dev/null
sudo chmod 600 /etc/btop-gui-agent.env
sudo systemctl enable --now btop-gui-agent
```
The unit runs as an unprivileged user via `DynamicUser=yes`. To kill other users' processes, you must enable `--allow-kill` and remove `DynamicUser` so it runs as root. Decide carefully.

## Security
- The client must send the token as its first message after connecting; a wrong token closes the connection immediately. Tokens are compared in constant time.
- Remote process killing is off by default. Even when enabled, PID 0, PID 1, and the agent itself are never killed.
- Traffic is plain `ws://`. Over the internet, put it behind a TLS reverse proxy for `wss://`, or use it inside a VPN/SSH tunnel.
- The app stores the host list and tokens in app-local storage (WebView localStorage).

## Development
Requires: Rust stable (1.90+), Node.js 22, [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

```bash
npm ci && npm --prefix ui ci
npm run dev                        # Desktop app (Next dev server + Tauri)
npm --prefix ui run dev            # UI only in a browser (remote hosts only)
cargo run -p btop-gui-agent -- --token dev --allow-kill
cargo test --workspace && npm --prefix ui test
npm run build                      # Installer for the current OS
```

## Keyboard shortcuts
| Key | Action |
|---|---|
| `/` | Search processes |
| `t` | Toggle tree view |
| `c` `m` `p` | Sort by CPU / memory / PID |
| `k` | Kill selected process |
| `1`–`9` | Switch host tab |
| `Esc` | Clear selection |

## Releases
Pushing a `v*` tag triggers GitHub Actions to build the macOS (arm64, x64), Windows, and Linux apps plus 5 agent binaries and attach them to the release.
```bash
git tag v0.1.0 && git push origin v0.1.0
```

## License
[Apache-2.0](LICENSE)
