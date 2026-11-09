import { supabase } from '../../../supabaseClient';

export type NdviObservation = { date: string; average: number };
type FieldActivity = {
  id: string; activity_date: string; activity_type: string;
  notes?: string | null;
};
export type PusulaOutcomeComparison = {
  sourceOperationId: string;
  fieldId: string;
  fieldName: string;
  status: 'awaiting_data' | 'comparable';
  headline: string;
  summary: string;
  evidence: string[];
  delta: number | null;
  evaluatedAt: string;
};

const DAY_MS = 86_400_000;
const day = (value: unknown) => {
  const date = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  return Date.parse(date + 'T12:00:00Z');
};
const average = (values: NdviObservation[]) =>
  values.reduce((total, value) => total + value.average, 0) / values.length;

export function evaluateRecordedFieldOutcome(input: {
  fieldId: string; fieldName: string; activities: FieldActivity[];
  ndviPoints: NdviObservation[]; now?: Date;
}): PusulaOutcomeComparison | null {
  const now = input.now ?? new Date();
  const today = now.getTime();
  const activities = input.activities
    .filter(a => Number.isFinite(day(a.activity_date)))
    .sort((a,b) => day(b.activity_date)-day(a.activity_date));
  const feedback = activities.find(a =>
    a.activity_type === 'Saha Kontrolü' &&
    String(a.notes ?? '').startsWith('Pusula işlem takibi |') &&
    /Kaynak işlem: [a-zA-Z0-9-]+/.test(String(a.notes ?? '')));
  if (!feedback) return null;
  const id = String(feedback.notes).match(/Kaynak işlem: ([a-zA-Z0-9-]+)/)?.[1];
  const source = activities.find(a =>
    a.id === id && a.id !== feedback.id &&
    ['Sulama','Gübreleme','İlaçlama'].includes(a.activity_type) &&
    day(a.activity_date) < day(feedback.activity_date));
  if (!source) return null;

  const operationDay = day(source.activity_date);
  const validPoints = input.ndviPoints.filter(p =>
    Number.isFinite(day(p.date)) && Number.isFinite(p.average) &&
    p.average >= -1 && p.average <= 1 &&
    day(p.date) <= today + DAY_MS)
    .sort((a,b) => day(a.date)-day(b.date));

  // Independent clear Sentinel observations on both sides of the operation
  // are required. No fabricated before/after or causal improvement claims.
  const before = validPoints.filter(p =>
    day(p.date) >= operationDay-35*DAY_MS &&
    day(p.date) < operationDay).slice(-2);
  const after = validPoints.filter(p =>
    day(p.date) >= operationDay+4*DAY_MS &&
    day(p.date) <= operationDay+40*DAY_MS).slice(0,2);
  const evidence = [
    'Tarla Defteri · ' + source.activity_type + ' · ' + source.activity_date,
    'Çiftçi saha gözlemi · ' + feedback.activity_date,
  ];
  const base = {
    sourceOperationId:source.id, fieldId:input.fieldId,
    fieldName:input.fieldName, evaluatedAt:now.toISOString(),
  };
  if (before.length < 2 || after.length < 2) {
    return {
      ...base, status:'awaiting_data', delta:null,
      headline:'Son işleminin uydu karşılaştırması için veri bekleniyor',
      summary:'Gözlemini kaydettim. İşlem öncesi ve sonrası için yeterli, karşılaştırılabilir NDVI ölçümü henüz yok. Yeni uygun uydu ölçümleri geldiğinde tekrar inceleyebiliriz.',
      evidence,
    };
  }
  const delta = average(after)-average(before);
  const trend = delta >= 0.04
    ? 'NDVI göstergesi yükselmiş'
    : delta <= -0.04
      ? 'NDVI göstergesi düşmüş'
      : 'NDVI göstergesi belirgin değişmemiş';
  return {
    ...base, status:'comparable', delta:Number(delta.toFixed(3)),
    headline:'Son işleminin öncesi ve sonrasını karşılaştırdım',
    summary:source.activity_date+' tarihli '+source.activity_type.toLocaleLowerCase('tr-TR')+
      ' kaydının iki tarafındaki uydu ölçümlerinde '+trend+'. '+
      'Bu değişim işlemin etkisini tek başına kanıtlamaz; mevsim, yağış ve gelişim evresi de etkili olabilir. Saha gözleminle birlikte değerlendirelim.',
    evidence:[...evidence,
      'Sentinel-2 NDVI · öncesi '+before[0].date+'–'+before[1].date+
      ' · sonrası '+after[0].date+'–'+after[1].date],
  };
}

/** Read only the signed-in farmer's own recorded work; no global user cache. */
export async function loadPusulaOutcomeComparison(input: {
  fieldId: string; fieldName: string; ndviPoints: NdviObservation[];
}): Promise<PusulaOutcomeComparison | null> {
  if (!input.fieldId || !input.ndviPoints.length) return null;
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;
  const since = new Date(Date.now()-150*DAY_MS).toISOString().slice(0,10);
  const { data, error } = await supabase.from('activities')
    .select('id,activity_type,activity_date,notes')
    .eq('user_id',auth.user.id).eq('field_id',input.fieldId)
    .gte('activity_date',since)
    .order('activity_date',{ascending:false}).limit(100);
  if (error) throw error;
  return evaluateRecordedFieldOutcome({
    ...input, activities:(data ?? []) as FieldActivity[],
  });
}
