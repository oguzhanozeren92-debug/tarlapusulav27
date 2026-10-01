import type { SoilAnalysisRecord } from '../../../lib/soilAnalysisService';
import type { SoilIntelligenceResult } from '../services/soilIntelligence.service';

/**
 * Home karar motorunun besin/toprak katmanından beklediği salt veri sözleşmesi.
 * Bu tip service dosyasından ayrıdır; karar tipleri ile üretim servisi arasında
 * ters yönlü bağımlılık oluşturmaz.
 */
export type HomeNutrientSignal = {
  fieldId: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  latestAnalysis: SoilAnalysisRecord | null;
  soilIntelligence?: SoilIntelligenceResult | null;
};
