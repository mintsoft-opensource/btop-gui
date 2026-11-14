use std::collections::HashSet;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use sysinfo::{
    Components, CpuRefreshKind, Disks, MemoryRefreshKind, Networks, Pid, ProcessRefreshKind, ProcessesToUpdate, RefreshKind, Signal,
    System, UpdateKind, Users,
};

use crate::hardware::Hardware;
use crate::snapshot::*;

const COMMAND_LIMIT: usize = 300;
const COMPONENT_EVERY: u64 = 5;
const USER_EVERY: u64 = 60;
const CPU_SENSOR_HINTS: [&str; 7] = ["cpu", "package", "core", "tctl", "tdie", "k10temp", "soc"];

pub struct Collector {
    system: System,
    disks: Disks,
    networks: Networks,
    components: Components,
    users: Users,
    hardware: Hardware,
    last: Instant,
    ticks: u64,
}

impl Default for Collector {
    fn default() -> Self {
        Self::new()
    }
}

impl Collector {
    pub fn new() -> Self {
        let system = System::new_with_specifics(
            RefreshKind::nothing()
                .with_cpu(CpuRefreshKind::everything())
                .with_memory(MemoryRefreshKind::everything())
                .with_processes(process_refresh()),
        );
        Self {
            system,
            disks: Disks::new_with_refreshed_list(),
            networks: Networks::new_with_refreshed_list(),
            components: Components::new_with_refreshed_list(),
            users: Users::new_with_refreshed_list(),
            hardware: Hardware::default(),
            last: Instant::now(),
            ticks: 0,
        }
    }

    pub fn sample(&mut self) -> Snapshot {
        let now = Instant::now();
        let seconds = now.duration_since(self.last).as_secs_f64().max(0.001);
        self.last = now;
        self.ticks += 1;

        self.system.refresh_cpu_all();
        self.system.refresh_memory();
        self.system
            .refresh_processes_specifics(ProcessesToUpdate::All, true, process_refresh());
        self.disks.refresh(true);
        self.networks.refresh(true);
        if self.ticks % COMPONENT_EVERY == 1 {
            self.components.refresh(true);
        }
        if self.ticks.is_multiple_of(USER_EVERY) {
            self.users.refresh();
        }

        let processes = self.processes(seconds);
        let temperatures = self.temperatures();
        Snapshot {
            at: unix_millis(),
            host: HostInfo {
                name: System::host_name().unwrap_or_default(),
                os: System::long_os_version().unwrap_or_else(|| std::env::consts::OS.into()),
                kernel: System::kernel_version().unwrap_or_default(),
                arch: System::cpu_arch(),
                uptime: System::uptime(),
                process_count: processes.len(),
            },
            cpu: self.cpu(&temperatures),
            memory: MemoryInfo {
                total: self.system.total_memory(),
                used: self.system.used_memory(),
                available: self.system.available_memory(),
                free: self.system.free_memory(),
                swap_total: self.system.total_swap(),
                swap_used: self.system.used_swap(),
            },
            disks: self.disks(seconds),
            networks: self.networks(seconds),
            temperatures,
            processes,
            gpus: self.hardware.gpus(),
            battery: self.hardware.battery(self.ticks),
        }
    }

    fn cpu(&self, temperatures: &[Temperature]) -> CpuInfo {
        let cpus = self.system.cpus();
        let load = System::load_average();
        CpuInfo {
            brand: cpus.first().map(|cpu| cpu.brand().trim().to_string()).unwrap_or_default(),
            usage: self.system.global_cpu_usage(),
            cores: cpus.iter().map(|cpu| cpu.cpu_usage()).collect(),
            frequency_mhz: cpus.iter().map(|cpu| cpu.frequency()).max().unwrap_or(0),
            physical_cores: System::physical_core_count(),
            load: (load.one > 0.0 || load.five > 0.0).then_some([load.one, load.five, load.fifteen]),
            temperature: cpu_temperature(temperatures.iter()),
        }
    }

    fn disks(&self, seconds: f64) -> Vec<DiskInfo> {
        let mut seen = HashSet::new();
        self.disks
            .list()
            .iter()
            .filter_map(|disk| {
                let mount = disk.mount_point().to_string_lossy().to_string();
                let file_system = disk.file_system().to_string_lossy().to_string();
                if !visible_disk(&mount, &file_system) || !seen.insert(mount.clone()) {
                    return None;
                }
                let usage = disk.usage();
                Some(DiskInfo {
                    name: disk.name().to_string_lossy().to_string(),
                    mount,
                    file_system,
                    total: disk.total_space(),
                    available: disk.available_space(),
                    read_rate: rate(usage.read_bytes, seconds),
                    write_rate: rate(usage.written_bytes, seconds),
                    removable: disk.is_removable(),
                })
            })
            .collect()
    }

    fn networks(&self, seconds: f64) -> Vec<NetworkInfo> {
        let mut list: Vec<NetworkInfo> = self
            .networks
            .list()
            .iter()
            .map(|(name, data)| NetworkInfo {
                name: name.clone(),
                rx_rate: rate(data.received(), seconds),
                tx_rate: rate(data.transmitted(), seconds),
                rx_total: data.total_received(),
                tx_total: data.total_transmitted(),
                addresses: data.ip_networks().iter().map(|net| net.addr.to_string()).collect(),
            })
            .collect();
        list.sort_by_key(|net| std::cmp::Reverse(net.rx_total + net.tx_total));
        list
    }

    fn temperatures(&self) -> Vec<Temperature> {
        self.components
            .list()
            .iter()
            .filter_map(|component| {
                let celsius = component.temperature()?;
                (celsius.is_finite() && celsius > 0.0).then(|| Temperature {
                    label: component.label().to_string(),
                    celsius,
                    critical: component.critical(),
                })
            })
            .collect()
    }

    fn processes(&self, seconds: f64) -> Vec<ProcessInfo> {
        self.system
            .processes()
            .values()
            .filter(|process| process.thread_kind().is_none())
            .map(|process| {
                let command = process
                    .cmd()
                    .iter()
                    .map(|part| part.to_string_lossy())
                    .collect::<Vec<_>>()
                    .join(" ");
                let disk = process.disk_usage();
                ProcessInfo {
                    pid: process.pid().as_u32(),
                    parent: process.parent().map(|pid| pid.as_u32()),
                    name: process.name().to_string_lossy().to_string(),
                    command: truncate(
                        if command.is_empty() {
                            process.name().to_string_lossy().to_string()
                        } else {
                            command
                        },
                        COMMAND_LIMIT,
                    ),
                    user: process
                        .user_id()
                        .and_then(|uid| self.users.get_user_by_id(uid))
                        .map(|user| user.name().to_string())
                        .unwrap_or_default(),
                    cpu: process.cpu_usage(),
                    memory: process.memory(),
                    virtual_memory: process.virtual_memory(),
                    status: process.status().to_string(),
                    started_at: process.start_time(),
                    read_rate: rate(disk.read_bytes, seconds),
                    write_rate: rate(disk.written_bytes, seconds),
                }
            })
            .collect()
    }
}

pub fn kill(pid: u32, force: bool) -> Result<(), String> {
    if pid <= 1 || pid == std::process::id() {
        return Err(format!("refusing to signal pid {pid}"));
    }
    let target = Pid::from_u32(pid);
    let mut system = System::new();
    system.refresh_processes_specifics(ProcessesToUpdate::Some(&[target]), true, ProcessRefreshKind::nothing());
    let process = system.process(target).ok_or_else(|| format!("process {pid} not found"))?;
    let signal = if force { Signal::Kill } else { Signal::Term };
    let sent = process.kill_with(signal).unwrap_or_else(|| process.kill());
    if sent {
        Ok(())
    } else {
        Err(format!("could not signal pid {pid} (permission denied?)"))
    }
}

fn process_refresh() -> ProcessRefreshKind {
    ProcessRefreshKind::nothing()
        .with_cpu()
        .with_memory()
        .with_disk_usage()
        .with_user(UpdateKind::OnlyIfNotSet)
        .with_cmd(UpdateKind::OnlyIfNotSet)
        .without_tasks()
}

fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn rate(bytes: u64, seconds: f64) -> u64 {
    (bytes as f64 / seconds).round() as u64
}

fn truncate(text: String, limit: usize) -> String {
    match text.char_indices().nth(limit) {
        Some((index, _)) => format!("{}…", &text[..index]),
        None => text,
    }
}

fn visible_disk(mount: &str, file_system: &str) -> bool {
    const HIDDEN_FS: [&str; 6] = ["squashfs", "overlay", "tmpfs", "devtmpfs", "autofs", "nullfs"];
    const HIDDEN_PREFIX: [&str; 5] = ["/System/Volumes/", "/private/var/vm", "/snap/", "/var/lib/docker/", "/run/"];
    !HIDDEN_FS.contains(&file_system.to_ascii_lowercase().as_str()) && !HIDDEN_PREFIX.iter().any(|prefix| mount.starts_with(prefix))
}

fn cpu_temperature<'a>(sensors: impl Iterator<Item = &'a Temperature>) -> Option<f32> {
    sensors
        .filter(|sensor| {
            let label = sensor.label.to_ascii_lowercase();
            CPU_SENSOR_HINTS.iter().any(|hint| label.contains(hint))
        })
        .map(|sensor| sensor.celsius)
        .reduce(f32::max)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sensor(label: &str, celsius: f32) -> Temperature {
        Temperature {
            label: label.into(),
            celsius,
            critical: None,
        }
    }

    #[test]
    fn rate_scales_by_elapsed_time() {
        assert_eq!(rate(1_000, 0.5), 2_000);
        assert_eq!(rate(0, 2.0), 0);
    }

    #[test]
    fn truncate_respects_char_boundaries() {
        assert_eq!(truncate("한글명령어".into(), 2), "한글…");
        assert_eq!(truncate("short".into(), 10), "short");
    }

    #[test]
    fn hides_virtual_and_system_mounts() {
        assert!(visible_disk("/", "apfs"));
        assert!(visible_disk("/mnt/data", "ext4"));
        assert!(visible_disk("C:\\", "NTFS"));
        assert!(!visible_disk("/System/Volumes/Data", "apfs"));
        assert!(!visible_disk("/snap/core/1", "squashfs"));
        assert!(!visible_disk("/dev/shm", "tmpfs"));
    }

    #[test]
    fn picks_hottest_cpu_sensor() {
        let sensors = [
            sensor("acpitz temp1", 90.0),
            sensor("coretemp Package id 0", 61.0),
            sensor("coretemp Core 1", 66.0),
        ];
        assert_eq!(cpu_temperature(sensors.iter()), Some(66.0));
        assert_eq!(cpu_temperature([sensor("nvme Composite", 40.0)].iter()), None);
    }

    #[test]
    fn samples_the_running_system() {
        let mut collector = Collector::new();
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        let snapshot = collector.sample();
        assert!(!snapshot.cpu.cores.is_empty());
        assert!(snapshot.memory.total > 0);
        assert!(snapshot.processes.iter().any(|p| p.pid == std::process::id()));
    }

    #[test]
    fn refuses_to_kill_init_or_itself() {
        assert!(kill(1, false).is_err());
        assert!(kill(std::process::id(), true).is_err());
    }
}
