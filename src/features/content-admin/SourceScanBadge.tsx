import { CheckCircle2, Clock3, Loader2, TriangleAlert } from 'lucide-react';

export type SourceScanVisualState = 'idle' | 'running' | 'success' | 'error';

export default function SourceScanBadge({ state='idle' }: { state?: SourceScanVisualState }) {
  const icon =
    state === 'running' ? <Loader2 size={13} className="tp-source-spin" /> :
    state === 'success' ? <CheckCircle2 size={13} /> :
    state === 'error' ? <TriangleAlert size={13} /> :
    <Clock3 size={13} />;
  const label =
    state === 'running' ? 'Taranıyor' :
    state === 'success' ? 'Hazır' :
    state === 'error' ? 'Hata' : 'Bekliyor';
  return <span className={`tp-source-scan-badge ${state}`}>{icon}{label}</span>;
}
