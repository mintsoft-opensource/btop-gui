export interface HostInfo {
  name: string;
  os: string;
  kernel: string;
  arch: string;
  uptime: number;
  processCount: number;
}

export interface CpuInfo {
  brand: string;
  usage: number;
  cores: number[];
  frequencyMhz: number;
  physicalCores: number | null;
  load: [number, number, number] | null;
  temperature: number | null;
}

export interface MemoryInfo {
  total: number;
  used: number;
  available: number;
  free: number;
  swapTotal: number;
  swapUsed: number;
}

export interface DiskInfo {
  name: string;
  mount: string;
  fileSystem: string;
  total: number;
  available: number;
  readRate: number;
  writeRate: number;
  removable: boolean;
}

export interface NetworkInfo {
  name: string;
  rxRate: number;
  txRate: number;
  rxTotal: number;
  txTotal: number;
  addresses: string[];
}

export interface Temperature {
  label: string;
  celsius: number;
  critical: number | null;
}

export interface ProcessInfo {
  pid: number;
  parent: number | null;
  name: string;
  command: string;
  user: string;
  cpu: number;
  memory: number;
  virtualMemory?: number;
  status: string;
  startedAt: number;
  readRate: number;
  writeRate: number;
}

export interface Snapshot {
  at: number;
  host: HostInfo;
  cpu: CpuInfo;
  memory: MemoryInfo;
  disks: DiskInfo[];
  networks: NetworkInfo[];
  temperatures: Temperature[];
  processes: ProcessInfo[];
  gpus?: GpuInfo[];
  battery?: BatteryInfo | null;
}

export interface GpuInfo {
  name: string;
  usage: number;
  memoryUsed: number | null;
  memoryTotal: number | null;
  temperature: number | null;
}

export interface BatteryInfo {
  percent: number;
  charging: boolean;
  plugged: boolean;
  remainingSecs: number | null;
}

export interface KillResult {
  ok: boolean;
  message: string;
}

export type LinkStatus = 'connecting' | 'online' | 'offline';
