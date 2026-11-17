/**
 * SoilGrids toprak profili için düz Türkçe yorum.
 *
 * Kurallar yerleşik sınıflamalardan:
 *  - pH: USDA Soil Survey Manual tepkime sınıfları.
 *  - Organik madde = organik karbon × 1,724 (van Bemmelen); sınıflar
 *    Türkiye'de yaygın kullanılan Ülgen & Yurtsever sınıflaması.
 *  - Su tutma, Ksat sınıfı, drenaj ve sıkışma: soilgrids fonksiyonunun
 *    hesapladığı Saxton & Rawls 2006 / USDA-NRCS sonuçları (varsa).
 * Hepsi 250 m çözünürlüklü model tahmini üzerinedir; laboratuvar analizi önceliklidir.
 */

export type SoilLayerRow = { depth: string; sand: number | null; silt: number | null; clay: number | null; ph: number | null; oc: number | null };
export type SoilNote = { title: string; text: string; tone: 'good' | 'watch' | 'info' };

export function phClass(ph: number): { label: string; note: string; tone: SoilNote['tone'] } {
  if (ph < 4.5) return { label: 'çok kuvvetli asit', note: 'Çoğu kültür bitkisi için fazla asidik; alüminyum ve mangan zararı, fosfor bağlanması görülebilir.', tone: 'watch' };
  if (ph <= 5.5) return { label: 'kuvvetli asit', note: 'Fosfor bağlanabilir, kalsiyum ve magnezyum azalabilir; kireçleme ihtiyacı laboratuvar analiziyle belirlenir.', tone: 'watch' };
  if (ph <= 6.0) return { label: 'orta asit', note: 'Asidik toprağı seven bitkiler için uygun; çoğu ürün için alt sınıra yakın.', tone: 'info' };
  if (ph <= 6.5) return { label: 'hafif asit', note: 'Besin elementlerinin çoğu için uygun aralık.', tone: 'good' };
  if (ph <= 7.3) return { label: 'nötr', note: 'Besin elementlerinin çoğu için uygun aralık.', tone: 'good' };
  if (ph <= 7.8) return { label: 'hafif alkali', note: 'Demir, çinko, mangan ve fosforun bitkiye geçişi azalabilir; meyve ağaçlarında genç yapraklarda sararma (demir klorozu) görülürse dikkat.', tone: 'info' };
  if (ph <= 8.4) return { label: 'orta alkali', note: 'Demir, çinko, mangan ve fosfor alımı belirgin zorlaşabilir; kireç ve tuz durumu laboratuvarda ölçülmeli.', tone: 'watch' };
  return { label: 'kuvvetli alkali', note: 'Sodyum/tuz sorunu olasılığı; laboratuvar analizi (EC, değişebilir sodyum) gerekir.', tone: 'watch' };
}

export function organicMatterClass(omPercent: number): string {
  if (omPercent < 1) return 'çok az';
  if (omPercent < 2) return 'az';
  if (omPercent < 3) return 'orta';
  if (omPercent < 4) return 'iyi';
  return 'yüksek';
}

const pct = (v: number) => `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v)}`;
const num1 = (v: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(v);

export function interpretSoil(input: {
  texture: { sand: number | null; silt: number | null; clay: number | null; label: string };
  ph: number | null;
  ocGkg: number | null;
  layers: SoilLayerRow[];
  intel?: any;
}): SoilNote[] {
  const notes: SoilNote[] = [];
  const { sand, silt, clay, label } = input.texture;

  if (input.ph !== null) {
    const c = phClass(input.ph);
    notes.push({ title: `pH ${num1(input.ph)} · ${c.label}`, text: c.note, tone: c.tone });
  }

  if (clay !== null && sand !== null && silt !== null) {
    let text: string;
    if (clay >= 35) text = 'Kil oranı yüksek: su tutma kapasitesi yüksek ama su yavaş süzülür. Sık ve az yerine seyrek ve derin sulama, tava gelmeden toprak işlememek önemli.';
    else if (sand >= 60) text = 'Kum oranı yüksek: su ve besin çabuk aşağı yıkanır. Az miktarda ama daha sık sulama ve gübrenin bölünerek verilmesi uygun olur.';
    else if (clay >= 27) text = 'Kil ve siltin dengeli olduğu, su tutması iyi bir toprak. Ağır sulamada yüzeyde göllenme olursa sulama süresini bölmek yardımcı olur.';
    else text = 'Kum, silt ve kil dengeli: işlenmesi kolay, su tutma ve süzülme orta düzeyde.';
    notes.push({ title: `Bünye · ${label} (kum ${pct(sand)}, silt ${pct(silt)}, kil ${pct(clay)})`, text, tone: 'info' });
  }

  const h = input.intel?.hydraulic;
  const paw = Number(h?.plant_available_water_vwc);
  if (h && Number.isFinite(paw) && paw > 0) {
    const mm30 = paw * 300;
    const fc = Number(h.field_capacity_vwc);
    const wp = Number(h.wilting_point_vwc);
    const ksat = h.ksat_class?.label ? ` Su geçirgenliği (Ksat): ${String(h.ksat_class.label).toLocaleLowerCase('tr-TR')}.` : '';
    notes.push({
      title: `Bitkiye yarayışlı su · 0–30 cm’de ≈ ${Math.round(mm30)} mm`,
      text: `Tarla kapasitesi ${pct(fc * 100)}, solma noktası ${pct(wp * 100)} (hacimce). Üst 30 cm toprak tam doluyken yaklaşık ${Math.round(mm30)} mm (dekara ${Math.round(mm30)} ton) su tutar.${ksat}`,
      tone: 'info',
    });
  }

  if (input.ocGkg !== null && input.ocGkg > 0) {
    const om = (input.ocGkg / 10) * 1.724;
    const cls = organicMatterClass(om);
    notes.push({
      title: `Organik madde ≈ %${num1(Math.floor(om * 10) / 10)} · ${cls}`,
      text: `Organik karbon ${num1(input.ocGkg)} g/kg; organik madde = karbon × 1,724. ${om < 2 ? 'Ahır gübresi, kompost, bitki artıklarını toprağa karıştırma ve yeşil gübre organik maddeyi artırır.' : 'Toprak yapısı ve su tutma için olumlu; bitki artıklarını yakmadan korumak bu düzeyi sürdürür.'}`,
      tone: om < 2 ? 'watch' : 'good',
    });
  }

  const top = input.layers[0];
  const bottom = input.layers[input.layers.length - 1];
  if (top && bottom && top !== bottom && top.clay !== null && bottom.clay !== null) {
    const diff = bottom.clay - top.clay;
    if (Math.abs(diff) >= 3) {
      notes.push({
        title: diff > 0 ? 'Derinlere doğru kil artıyor' : 'Derinlere doğru kil azalıyor',
        text: diff > 0
          ? `Kil ${top.depth} katmanında ${pct(top.clay)}, ${bottom.depth} katmanında ${pct(bottom.clay)}. Alt katmanda su daha yavaş süzülür; aşırı sulamada kök bölgesinde su birikebilir.`
          : `Kil ${top.depth} katmanında ${pct(top.clay)}, ${bottom.depth} katmanında ${pct(bottom.clay)}. Alt katmanda su daha hızlı süzülür.`,
        tone: 'info',
      });
    } else {
      notes.push({ title: 'Katmanlar birbirine benziyor', text: 'İlk 30 cm’de kil, kum ve pH belirgin değişmiyor; toprak bu derinlikte homojen görünüyor.', tone: 'good' });
    }
  }

  const drain = input.intel?.susceptibility?.waterlogging;
  const comp = input.intel?.compaction;
  const extra: string[] = [];
  if (drain?.label && drain.status !== 'unknown') extra.push(`Drenaj: ${drain.label}.`);
  if (comp?.label && comp.status !== 'unknown') extra.push(`Sıkışma: ${comp.label}${comp.bulk_density_g_cm3 ? ` (hacim ağırlığı ${num1(comp.bulk_density_g_cm3)} g/cm³)` : ''}.`);
  if (extra.length) {
    notes.push({ title: 'Drenaj ve sıkışma', text: extra.join(' '), tone: drain?.status === 'elevated' || comp?.status === 'attention' ? 'watch' : 'info' });
  }
  return notes;
}
