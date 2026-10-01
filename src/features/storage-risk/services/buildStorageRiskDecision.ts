import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type { StorageRiskSnapshot } from '../types/storageRisk';

export function buildStorageRiskDecision(snapshot: StorageRiskSnapshot | null | undefined): HomeDecisionEvent | null {
  if (!snapshot || snapshot.status === 'no_lots' || snapshot.lotCount === 0) return null;
  const observedAt = snapshot.generatedAt;
  if (snapshot.riskLevel === 'high') {
    const lot = snapshot.lots.find((item) => item.riskLevel === 'high') ?? snapshot.lots[0];
    return {
      id: `storage-risk:${snapshot.fieldId ?? 'global'}:high:${observedAt.slice(0, 10)}`,
      group: 'storage-risk', source: 'storage-risk', sourceModel: 'storage-risk-engine-v18',
      signal: { status: 'ready', observedAt, maxAgeHours: 24 }, priority: 91, severity: 'danger', target: 'inventory',
      channels: ['today', 'notification', 'pusula'], kind: 'check', label: 'DEPO RİSKİ',
      title: `${lot.lot.crop} depolama koşullarını kontrol et`,
      detail: `${snapshot.highRiskLotCount} depolama partisinde yüksek çevresel risk taraması var. Bu sonuç mikotoksin teşhisi değildir; ürün nemi ve depo koşullarını doğrula, şüpheli üründe laboratuvar analizi planla.`,
      evidence: snapshot.evidence,
      confidence: 'medium',
      today: { tone: 'red', visual: 'spraying', iconKey: 'document', iconClass: 'leaf' },
      notification: { iconKey: 'document', iconTone: 'gold', dotTone: 'danger' },
    };
  }
  if (snapshot.riskLevel === 'attention') {
    return {
      id: `storage-risk:${snapshot.fieldId ?? 'global'}:attention:${observedAt.slice(0, 10)}`,
      group: 'storage-risk', source: 'storage-risk', sourceModel: 'storage-risk-engine-v18',
      signal: { status: 'ready', observedAt, maxAgeHours: 48 }, priority: 73, severity: 'warning', target: 'inventory',
      channels: ['notification', 'pusula'], kind: 'check', label: 'DEPO TAKİBİ',
      title: 'Depolama ölçümlerini yeniden kontrol et',
      detail: `${snapshot.attentionLotCount} partide sıcaklık/nem/ürün nemi açısından dikkat sinyali var. Eğilimi tekrar ölç; bu tarama küf veya mikotoksin teşhisi değildir.`,
      evidence: snapshot.evidence, confidence: 'medium',
      notification: { iconKey: 'document', iconTone: 'gold', dotTone: 'warning' },
    };
  }
  if (snapshot.status === 'needs_data') {
    return {
      id: `storage-risk:${snapshot.fieldId ?? 'global'}:needs-data`, group: 'storage-risk', source: 'storage-risk', sourceModel: 'storage-risk-engine-v18',
      signal: { status: 'needs-data', observedAt, maxAgeHours: 168 }, priority: 38, severity: 'info', target: 'inventory',
      channels: ['notification'], kind: 'data', label: 'DEPO VERİSİ', title: 'Depo sıcaklık/nem ölçümü eksik',
      detail: 'Depolanan ürün için ürün nemi veya depo sıcaklık/nem ölçümü ekle. Ölçüm olmadan mikotoksin riski tahmin edilmiyor.',
      evidence: snapshot.evidence, confidence: 'preliminary',
      notification: { iconKey: 'document', iconTone: 'gold', dotTone: 'info' },
    };
  }
  return null;
}
