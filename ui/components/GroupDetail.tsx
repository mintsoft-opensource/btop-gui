import { bytes, percent, rate, ratio } from '@/lib/format';
import { sumTrends, type ProcessHistory } from '@/lib/history';
import { processKey, type AppGroup } from '@/lib/processes';
import type { Snapshot } from '@/lib/types';
import { DETAIL_GRID, DetailFrame, Fact } from './DetailFrame';
import { Sparkline } from './Sparkline';
import { button, cx, linkButton } from './ui';

const TOP_MEMBERS = 4;

interface Props {
  group: AppGroup;
  expanded: boolean;
  trends: ProcessHistory;
  snapshot: Snapshot;
  onToggle: () => void;
  onSelect: (key: string | null) => void;
}

export function GroupDetail({ group, expanded, trends, snapshot, onToggle, onSelect }: Props) {
  const { total, members } = group;
  const memberTrends = members.flatMap((member) => trends.get(member.pid) ?? []);
  const busiest = [...members].sort((a, b) => b.cpu - a.cpu).slice(0, TOP_MEMBERS);
  return (
    <DetailFrame
      title={group.name}
      subtitle={`${members.length} processes · ${total.user || 'various users'}`}
      actions={<button className={cx(button(), 'px-2.5 py-0.5')} onClick={onToggle}>{expanded ? 'COLLAPSE' : 'SHOW PROCESSES'}</button>}
      onClose={() => onSelect(null)}
      facts={
        <dl className={DETAIL_GRID}>
          <Fact label="MEMORY">{bytes(total.memory)} <span className="text-muted">· {percent(ratio(total.memory, snapshot.memory.total), 1)}</span></Fact>
          <Fact label="DISK I/O">R {rate(total.readRate)} · W {rate(total.writeRate)}</Fact>
          <Fact label="BUSIEST" wide>
            {busiest.map((member) => (
              <button
                key={member.pid}
                className={linkButton}
                onClick={() => {
                  if (!expanded) onToggle();
                  onSelect(processKey(member.pid));
                }}
              >
                {member.name} {member.cpu.toFixed(1)}%
              </button>
            ))}
          </Fact>
        </dl>
      }
      trends={[
        [`CPU ${percent(total.cpu, 1)}`, <Sparkline key="cpu" values={sumTrends(memberTrends, 'cpu')} width={150} height={30} />],
        [`MEM ${bytes(total.memory)}`, <Sparkline key="mem" values={sumTrends(memberTrends, 'memory')} floor={1} width={150} height={30} />],
      ]}
    />
  );
}
