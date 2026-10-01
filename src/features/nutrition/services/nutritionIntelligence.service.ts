import { supabase } from '../../../supabaseClient';

export type NutritionDecisionStatus =
  | 'lab_ready'
  | 'lab_attention'
  | 'crop_context_changed'
  | 'context_only'
  | 'needs_analysis';

export type NutritionAuthorityBasis =
  | 'laboratory'
  | 'soilgrids_context'
  | 'insufficient';

export type NutritionIntelligenceDecision = {
  status: 'ready' | 'partial' | 'needs_data';
  decision_status: NutritionDecisionStatus;
  confidence: 'low' | 'medium' | 'high' | 'unknown';
  authority_basis: NutritionAuthorityBasis;
  headline: string;
  summary: string;
  action: string;
};

export type NutritionConflict = {
  type?: string;
  note?: string;
  [key: string]: unknown;
};

export type NutritionIntelligenceResponse = {
  success: true;
  mode: 'nutrition';
  engine: 'soil-nutrition-engine';
  authority_scope: 'nutrition.field_decision';
  production_authority: true;
  field_id: string;
  snapshot_id: string;
  nutrition: NutritionIntelligenceDecision;
  laboratory: {
    available: boolean;
    id?: string;
    status?: string | null;
    crop?: string | null;
    created_at?: string | null;
  };
  soilgrids: {
    available: boolean;
    role: 'context_only';
    production_authority: false;
    generated_at?: string | null;
  };
  recent_fertilization_count: number;
  phenology_context: {
    stage?: string | null;
    stage_label?: string | null;
    confidence?: string | null;
    authority_basis?: string | null;
    summary?: string | null;
    generated_at?: string | null;
  } | null;
  conflicts: NutritionConflict[];
  missing_inputs: string[];
  generated_at: string;
};

type NutritionIntelligenceError = {
  success?: false;
  error?: string;
  message?: string;
};

export async function fetchNutritionIntelligence(
  fieldId: string,
): Promise<NutritionIntelligenceResponse> {
  const normalizedFieldId = String(fieldId ?? '').trim();
  if (!normalizedFieldId) {
    throw new Error('Toprak & Besin Zekâsı için field_id gerekli.');
  }

  const { data, error } = await supabase.functions.invoke<
    NutritionIntelligenceResponse | NutritionIntelligenceError
  >('analyze-field-intelligence', {
    body: {
      mode: 'nutrition',
      field_id: normalizedFieldId,
    },
  });

  if (error) {
    throw new Error(`Toprak & Besin Zekâsı sunucu isteği başarısız: ${error.message}`);
  }

  if (!data || data.success !== true || data.mode !== 'nutrition') {
    const failed = data as NutritionIntelligenceError | null;
    throw new Error(
      failed?.message ??
        failed?.error ??
        'Toprak & Besin Zekâsı geçerli bir karar döndürmedi.',
    );
  }

  return data;
}
