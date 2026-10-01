const LABELS: Record<string, { label: string; unit: string }> = {
  protein_pct: { label: 'Protein', unit: '%' },
  moisture_pct: { label: 'Ürün nemi', unit: '%' },
  hectoliter_kg_hl: { label: 'Hektolitre', unit: 'kg/hl' },
  brix: { label: 'Brix', unit: '°Bx' },
  fruit_size_mm: { label: 'Meyve iriliği', unit: 'mm' },
  fruit_weight_g: { label: 'Meyve ağırlığı', unit: 'g' },
};

export function harvestQualityMeasurementLabel(key: string) {
  return LABELS[key]?.label ?? key.replace(/_/g, ' ');
}

export function formatHarvestQualityMeasurements(
  measurements: Record<string, number | string | null | undefined> | null | undefined,
  limit = 4,
) {
  return Object.entries(measurements ?? {})
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .slice(0, limit)
    .map(([key, value]) => {
      const meta = LABELS[key];
      const numeric = typeof value === 'number' && Number.isFinite(value)
        ? value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
        : String(value);
      return meta ? `${meta.label}: ${numeric} ${meta.unit}` : `${harvestQualityMeasurementLabel(key)}: ${numeric}`;
    });
}
