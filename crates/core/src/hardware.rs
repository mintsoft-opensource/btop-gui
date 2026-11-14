use std::process::Command;

use crate::snapshot::{BatteryInfo, GpuInfo};

const BATTERY_EVERY: u64 = 10;

#[derive(Default)]
pub struct Hardware {
    battery: Option<BatteryInfo>,
    nvidia_missing: bool,
}

impl Hardware {
    pub fn gpus(&mut self) -> Vec<GpuInfo> {
        let mut gpus = platform_gpus();
        if !self.nvidia_missing && !cfg!(target_os = "macos") {
            match run(
                "nvidia-smi",
                &[
                    "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                    "--format=csv,noheader,nounits",
                ],
            ) {
                Some(output) => gpus.extend(parse_nvidia_smi(&output)),
                None => self.nvidia_missing = true,
            }
        }
        gpus
    }

    pub fn battery(&mut self, tick: u64) -> Option<BatteryInfo> {
        if tick % BATTERY_EVERY == 1 {
            self.battery = platform_battery();
        }
        self.battery.clone()
    }
}

fn run(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(target_os = "macos")]
fn platform_gpus() -> Vec<GpuInfo> {
    run("ioreg", &["-r", "-d", "1", "-w", "0", "-c", "IOAccelerator"])
        .map(|output| parse_ioreg(&output))
        .unwrap_or_default()
}

#[cfg(target_os = "linux")]
fn platform_gpus() -> Vec<GpuInfo> {
    use std::fs;
    let read = |path: std::path::PathBuf| fs::read_to_string(path).ok().map(|text| text.trim().to_string());
    let Ok(entries) = fs::read_dir("/sys/class/drm") else {
        return Vec::new();
    };
    let mut cards: Vec<_> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("card") && name[4..].chars().all(|c| c.is_ascii_digit()))
        })
        .collect();
    cards.sort();
    cards
        .into_iter()
        .filter_map(|card| {
            let device = card.join("device");
            let usage: f32 = read(device.join("gpu_busy_percent"))?.parse().ok()?;
            let temperature = fs::read_dir(device.join("hwmon"))
                .ok()
                .and_then(|mut dirs| dirs.next())
                .and_then(|dir| dir.ok())
                .and_then(|dir| read(dir.path().join("temp1_input")))
                .and_then(|milli| milli.parse::<f32>().ok())
                .map(|milli| milli / 1000.0);
            Some(GpuInfo {
                name: read(device.join("product_name"))
                    .unwrap_or_else(|| card.file_name().unwrap_or_default().to_string_lossy().to_string()),
                usage,
                memory_used: read(device.join("mem_info_vram_used")).and_then(|v| v.parse().ok()),
                memory_total: read(device.join("mem_info_vram_total")).and_then(|v| v.parse().ok()),
                temperature,
            })
        })
        .collect()
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn platform_gpus() -> Vec<GpuInfo> {
    Vec::new()
}

#[cfg(target_os = "macos")]
fn platform_battery() -> Option<BatteryInfo> {
    parse_pmset(&run("pmset", &["-g", "batt"])?)
}

#[cfg(target_os = "linux")]
fn platform_battery() -> Option<BatteryInfo> {
    use std::fs;
    let read = |path: std::path::PathBuf| fs::read_to_string(path).ok().map(|text| text.trim().to_string());
    fs::read_dir("/sys/class/power_supply").ok()?.flatten().find_map(|entry| {
        let path = entry.path();
        if read(path.join("type"))?.as_str() != "Battery" {
            return None;
        }
        let percent: f32 = read(path.join("capacity"))?.parse().ok()?;
        let status = read(path.join("status")).unwrap_or_default();
        Some(BatteryInfo {
            percent,
            charging: status == "Charging",
            plugged: status != "Discharging",
            remaining_secs: None,
        })
    })
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn platform_battery() -> Option<BatteryInfo> {
    None
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn parse_ioreg(output: &str) -> Vec<GpuInfo> {
    output
        .split("+-o ")
        .filter_map(|block| {
            let usage: f32 = number_after(block, "\"Device Utilization %\"=")?;
            Some(GpuInfo {
                name: quoted_after(block, "\"model\" = \"").unwrap_or_else(|| "GPU".into()),
                usage,
                memory_used: number_after(block, "\"In use system memory\"="),
                memory_total: None,
                temperature: None,
            })
        })
        .collect()
}

pub(crate) fn parse_nvidia_smi(output: &str) -> Vec<GpuInfo> {
    const MIB: u64 = 1024 * 1024;
    output
        .lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split(',').map(str::trim).collect();
            let [name, usage, used, total, temperature] = fields.as_slice() else {
                return None;
            };
            Some(GpuInfo {
                name: name.to_string(),
                usage: usage.parse().ok()?,
                memory_used: used.parse::<u64>().ok().map(|mib| mib * MIB),
                memory_total: total.parse::<u64>().ok().map(|mib| mib * MIB),
                temperature: temperature.parse().ok(),
            })
        })
        .collect()
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn parse_pmset(output: &str) -> Option<BatteryInfo> {
    let line = output.lines().find(|line| line.contains("InternalBattery"))?;
    let detail = line.split_once('\t')?.1;
    let mut parts = detail.split(';').map(str::trim);
    let percent: f32 = parts.next()?.trim_end_matches('%').parse().ok()?;
    let state = parts.next().unwrap_or_default();
    let remaining_secs = parts.next().and_then(|text| {
        let (hours, minutes) = text.split_whitespace().next()?.split_once(':')?;
        let seconds = hours.parse::<u64>().ok()? * 3600 + minutes.parse::<u64>().ok()? * 60;
        (seconds > 0 && !text.contains("no estimate")).then_some(seconds)
    });
    Some(BatteryInfo {
        percent,
        charging: state == "charging",
        plugged: output.contains("'AC Power'"),
        remaining_secs,
    })
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn number_after<T: std::str::FromStr>(text: &str, key: &str) -> Option<T> {
    let rest = &text[text.find(key)? + key.len()..];
    let end = rest.find(|c: char| !c.is_ascii_digit() && c != '.').unwrap_or(rest.len());
    rest[..end].parse().ok()
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn quoted_after(text: &str, key: &str) -> Option<String> {
    let rest = &text[text.find(key)? + key.len()..];
    Some(rest[..rest.find('"')?].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_apple_gpu_statistics() {
        let output = r#"+-o AGXAcceleratorG14X  <class AGXAcceleratorG14X>
    {
      "PerformanceStatistics" = {"Tiler Utilization %"=45,"Device Utilization %"=37,"In use system memory"=2578382848}
      "model" = "Apple M2 Max"
    }"#;
        let gpus = parse_ioreg(output);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].name, "Apple M2 Max");
        assert_eq!(gpus[0].usage, 37.0);
        assert_eq!(gpus[0].memory_used, Some(2_578_382_848));
        assert!(parse_ioreg("+-o IOService <class IOService>").is_empty());
    }

    #[test]
    fn parses_nvidia_smi_rows() {
        let gpus = parse_nvidia_smi("NVIDIA GeForce RTX 4090, 12, 2048, 24564, 41\nbroken line\n");
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].usage, 12.0);
        assert_eq!(gpus[0].memory_total, Some(24_564 * 1024 * 1024));
        assert_eq!(gpus[0].temperature, Some(41.0));
    }

    #[test]
    fn parses_pmset_battery_states() {
        let charged =
            parse_pmset("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining present: true").unwrap();
        assert_eq!(charged.percent, 100.0);
        assert!(charged.plugged && !charged.charging);
        assert_eq!(charged.remaining_secs, None);

        let draining =
            parse_pmset("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t64%; discharging; 3:25 remaining present: true")
                .unwrap();
        assert!(!draining.plugged && !draining.charging);
        assert_eq!(draining.remaining_secs, Some(3 * 3600 + 25 * 60));

        assert!(parse_pmset("Now drawing from 'AC Power'").is_none());
    }
}
