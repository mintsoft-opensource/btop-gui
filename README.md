# btop-gui

> A **cross-platform GUI system monitor** inspired by [btop](https://github.com/aristocratos/btop).
> Desktop app for macOS · Windows · Linux.

Apache-2.0 · Maintained by MintSoft · An independent project, not affiliated with btop.

## What it shows
One control-room screen built for keeping an eye on a machine:

- **Status bar**: overall health (all normal / warnings / critical), uptime, load, process count, CPU temperature, battery
- **Metric tiles** for CPU, memory, GPU, disk, network and battery, each with a large value, a NORMAL / WARNING / CRITICAL badge, the reason for any alert and a live chart. Click a tile (or press `1`–`6`) for its detail panel.
- **Event log** of threshold crossings (sustained CPU load, memory, swap, CPU temperature, full volumes, low battery), logging escalations and recoveries without flapping
- **Process list** beside the tiles

Detail panels:

- **CPU**: usage history, per-core bars, load, clock, temperature, uptime
- **Memory**: usage history, used/available/cache, swap, top apps by memory
- **GPU**: utilization and memory (Apple Silicon via IOKit, AMD via sysfs, NVIDIA via `nvidia-smi`)
- **Disk**: read/write history, usage per volume
- **Network**: in/out history, per-interface rates and totals
- **Battery**: charge history, power source, time remaining (macOS, Linux)

Also:

- **Processes**
  - **Apps** view groups helper processes under their app (e.g. 60+ `Google Chrome Helper` → one `Google Chrome` row with totals), expandable
  - **List** and **Tree** views (tree branches rank by their subtree totals), sortable by CPU · memory · PID · name · user · I/O (click again to reverse), search
  - CPU trend sparkline on every row; detail view with CPU/memory history, parent, children, start time, full command
  - End processes (SIGTERM / SIGKILL)
- **Settings**: light / dark mode (or follow the system), themes (Phosphor / Amber / Matrix), scanlines, °C / °F, graph length, refresh rate

## Layout
```
crates/core    # Rust collector (sysinfo, IOKit/sysfs for GPU and battery)
src-tauri      # Tauri 2 desktop shell: local metrics are delivered via Tauri events
ui             # Next.js (static export) + Tailwind CSS v4 frontend
```

## Install
Download from [Releases](https://github.com/mintsoft-opensource/btop-gui/releases).

| OS | Installer |
|---|---|
| macOS (Apple Silicon / Intel) | `.dmg` |
| Windows | `.msi` / `-setup.exe` |
| Linux | `.deb` / `.rpm` / `.AppImage` |

Builds are unsigned, so you will see a warning on first launch.
- macOS: run `xattr -cr /Applications/btop-gui.app`, then launch
- Windows: in SmartScreen, click **More info → Run anyway**

## Security
- Killing processes only works for processes your user may signal. PID 0, PID 1 and the app itself are never signaled.

## Development
Requires: Rust stable (1.90+), Node.js 22, [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

```bash
npm ci && npm --prefix ui ci
npm run dev                        # Desktop app (Next dev server + Tauri)
cargo test --workspace && npm --prefix ui test
npm run build                      # Installer for the current OS
```

## Keyboard shortcuts
| Key | Action |
|---|---|
| `1`–`6` | Open metric details |
| `a` `l` `t` | Apps / list / tree view |
| `/` | Search processes |
| `↑` `↓` `PgUp` `PgDn` | Select row |
| `→` `←` `Enter` | Expand / collapse app group |
| `c` `m` `p` | Sort by CPU / memory / PID (press again to reverse) |
| `k` | End selected process |
| `,` | Settings |
| `Esc` | Clear selection |

Shortcuts use physical key positions, so they work with any input source (e.g. Korean).

## Releases
Pushing a `v*` tag triggers GitHub Actions to build the macOS (arm64, x64), Windows, and Linux apps and attach them to the release.
```bash
git tag v0.1.0 && git push origin v0.1.0
```

## License
[Apache-2.0](LICENSE)
