import type { Snapshot } from './types';

export const HISTORY_LENGTH = 120;

export interface Sample {
  at: number;
  cpu: number;
  memory: number;
  rx: number;
  tx: number;
  read: number;
  write: number;
}

const EXCLUDED_INTERFACE = /^(lo\d*|utun\d*|awdl\d*|llw\d*|bridge\d*|gif\d*|stf\d*|anpi\d*|ap\d*|docker\d*|br-.*|veth.*|virbr\d*|vEthernet.*|Loopback.*)$/i;

export function isPhysicalInterface(name: string): boolean {
  return !EXCLUDED_INTERFACE.test(name);
}

export function sampleOf(snapshot: Snapshot): Sample {
  const physical = snapshot.networks.filter((net) => isPhysicalInterface(net.name));
  return {
    at: snapshot.at,
    cpu: snapshot.cpu.usage,
    memory: snapshot.memory.total ? (snapshot.memory.used / snapshot.memory.total) * 100 : 0,
    rx: physical.reduce((sum, net) => sum + net.rxRate, 0),
    tx: physical.reduce((sum, net) => sum + net.txRate, 0),
    read: snapshot.disks.reduce((sum, disk) => sum + disk.readRate, 0),
    write: snapshot.disks.reduce((sum, disk) => sum + disk.writeRate, 0),
  };
}

export function pushSample(history: Sample[], sample: Sample, limit = HISTORY_LENGTH): Sample[] {
  const next = history.length >= limit ? history.slice(history.length - limit + 1) : history.slice();
  next.push(sample);
  return next;
}
