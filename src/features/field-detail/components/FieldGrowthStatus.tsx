import { useMemo } from 'react';
import { Sprout } from 'lucide-react';

import { useHomePhenologyInsight } from '../../phenology/hooks/useHomePhenologyInsight';
import type { PhenologyResult } from '../../phenology/types/phenology';

import './FieldGrowthStatus.css';

type Props = {
  field: any;
};

export type FieldGrowthStatusViewProps = {
  field: any;
  phenology: PhenologyResult | null | undefined;
  contextStatus?: string | null;
  timeSeriesStatus?: string | null;
  contextMessage?: string | null;
  timeSeriesMessage?: string | null;
};

function confidenceLabel(value: unknown) {
  if (value === 'high') return 'Yüksek';
  if (value === 'medium') return 'Orta';
  return 'Ön değerlendirme';
}

export function FieldGrowthStatusView({
  field,
  phenology,
  contextStatus = null,
  timeSeriesStatus = null,
  contextMessage = null,
  timeSeriesMessage = null,
}: FieldGrowthStatusViewProps) {
  const basisItems = useMemo(() => {
    const raw = (phenology as any)?.basis;
    if (Array.isArray(raw)) {
      return raw.map((item) => String(item ?? '').trim()).filter(Boolean);
    }
    if (raw === null || raw === undefined || raw === '') return [];
    return [String(raw).trim()].filter(Boolean);
  }, [phenology]);

  const sourceLabel = useMemo(() => {
    const evidence = basisItems
      .map((item) => item.toLocaleLowerCase('tr-TR'))
      .join(' ');

    if (evidence.includes('saha gözlemi')) return 'Saha gözlemi + modeller';
    if (evidence.includes('nasa harvest') && /pcse|wofost/.test(evidence)) {
      return 'Uydu + ürün modeli + sezon';
    }
    if (evidence.includes('nasa harvest')) return 'Uydu + sezon';
    if (/pcse|wofost/.test(evidence)) return 'Ürün modeli + sezon';
    if (String(field?.cropCycle ?? field?.crop_cycle ?? '') === 'perennial') {
      return 'Ürün takvimi + sezon';
    }
    return 'Sezon + gelişim verisi';
  }, [basisItems, field?.cropCycle, field?.crop_cycle]);

  const usable = Boolean(
    phenology &&
      phenology.dataStatus === 'usable' &&
      phenology.stage !== 'unknown',
  );

  const loading = contextStatus === 'loading' || timeSeriesStatus === 'loading';

  return (
    <section className="tp-field-growth-status" aria-label="Gelişim durumu">
      <div className="tp-field-growth-status-icon" aria-hidden="true">
        <Sprout size={21} strokeWidth={1.8} />
      </div>

      <div className="tp-field-growth-status-copy">
        <span>GELİŞİM DURUMU</span>
        <strong>
          {usable
            ? phenology?.stageLabel || 'Gelişim dönemi'
            : loading
              ? 'Gelişim verisi hazırlanıyor'
              : 'Gelişim dönemi henüz net değil'}
        </strong>
        <p>
          {usable
            ? phenology?.summary ||
              'Sezon ve gözlem verileri birlikte değerlendirilerek mevcut gelişim dönemi izleniyor.'
            : contextMessage ||
              timeSeriesMessage ||
              'Sezon veya gözlem verisi tamamlandıkça bu alan otomatik güncellenecek.'}
        </p>

        {usable ? (
          <div className="tp-field-growth-status-meta">
            <span>Güven: {confidenceLabel(phenology?.confidence)}</span>
            <span>{sourceLabel}</span>
          </div>
        ) : null}

        {usable && basisItems.length > 0 ? (
          <small>{basisItems.slice(0, 2).join(' · ')}</small>
        ) : null}
      </div>
    </section>
  );
}

export default function FieldGrowthStatus({ field }: Props) {
  const insight = useHomePhenologyInsight(field);

  return (
    <FieldGrowthStatusView
      field={field}
      phenology={insight.phenology}
      contextStatus={insight.phenologyContextStatus}
      timeSeriesStatus={insight.timeSeriesStatus}
      contextMessage={insight.phenologyContextMessage}
      timeSeriesMessage={insight.timeSeriesMessage}
    />
  );
}
