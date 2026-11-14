import type { TempUnit } from '@/lib/format';
import type { Sample } from '@/lib/history';
import type { Snapshot } from '@/lib/types';

export interface PanelProps {
  snapshot: Snapshot;
  history: Sample[];
  capacity: number;
  spanSeconds: number | null;
  tempUnit: TempUnit;
}
