// OTOMATİK KOPYA — düzenleme: src/features/pest-calendar/data/pestCalendar.ts, sonra scripts/sync-water-need-core.mjs
/**
 * Türkiye geneli zararlı/hastalık izleme takvimi.
 *
 * Yalnızca Bakanlık kaynaklarında yazan izleme zamanı, örnekleme yöntemi,
 * ekonomik zarar eşiği ve karar zamanı ölçütleri alınmıştır. İlaç adı, etken
 * madde ve doz BİLEREK yoktur: reçeteyi yetkili ziraat mühendisi e-reçete ile
 * yazar. Kaynakta ay adı geçmiyorsa `aylar` boş bırakılır; ay uydurulmaz.
 * `mevsim` yalnızca kaynak "kış", "ilkbahar" gibi açıkça mevsim söylediğinde
 * doldurulur.
 */

export type PestKind = 'zararli' | 'hastalik' | 'yabanciot';
export type Season = 'kis' | 'ilkbahar' | 'yaz' | 'sonbahar';

export type PestEntry = {
  id: string;
  ad: string;
  latince?: string;
  tur: PestKind;
  /** Kaynakta adı geçen aylar (1-12). */
  aylar?: number[];
  /** Kaynakta açıkça geçen mevsim. */
  mevsim?: Season[];
  /** Ne zaman bakılır / karar ne zaman verilir (kaynaktaki ifadeye sadık). */
  zaman: string;
  izleme?: string;
  esik?: string;
  not?: string;
  /** Hava verisiyle hesaplanabilen resmî koşul. */
  kural?: 'mildiyo';
  /** İlk ergin yakalanmasından sonra resmî gün-derece hedefi (10 °C taban). */
  gunDerece?: { hedef: number; anlam: string };
  kaynak: string;
  sayfa?: string;
};

export type CropCalendar = {
  key: string;
  ad: string;
  /** Uygulamadaki ürün adları (src/data/crops.ts). */
  urunler: string[];
  /** Resmî talimatın tamamına erişilemediyse 'kismi'. */
  kapsam: 'genis' | 'kismi';
  girdiler: PestEntry[];
};

export const SEASON_MONTHS: Record<Season, number[]> = {
  kis: [12, 1, 2], ilkbahar: [3, 4, 5], yaz: [6, 7, 8], sonbahar: [9, 10, 11],
};

export const PEST_CALENDARS: CropCalendar[] = [{"key":"zeytin","ad":"Zeytin","urunler":["Zeytin"],"kapsam":"genis","girdiler":[{"id":"zeytin-sinegi","ad":"Zeytin sineği","tur":"zararli","aylar":[6,7,8],"zaman":"","kaynak":"zeytinEMTT"},{"id":"zeytin-guvesi","ad":"Zeytin güvesi","tur":"zararli","aylar":[3],"zaman":"","kaynak":"zeytinEMTT"},{"id":"fidantirtili","ad":"Fidantırtılı","tur":"zararli","aylar":[4,5,6,7,8,9,10,11],"zaman":"","kaynak":"zeytinEMTT"},{"id":"pamuklubit","ad":"Zeytin pamuklubiti","tur":"zararli","zaman":"","kaynak":"zeytinEMTT"},{"id":"kabuklubit","ad":"Zeytin kabuklubiti","tur":"zararli","aylar":[7,8],"zaman":"","kaynak":"zeytinEMTT"},{"id":"karakosnil","ad":"Karakoşnil","tur":"zararli","aylar":[5,6],"zaman":"","kaynak":"zeytinEMTT"},{"id":"cicek-sap-sokanlari","ad":"Çiçek sap sokanları","tur":"zararli","aylar":[4,5],"zaman":"","kaynak":"zeytinEMTT"},{"id":"zeytin-pasakarlari","ad":"Pasakarları","tur":"zararli","aylar":[4],"zaman":"","kaynak":"zeytinEMTT"},{"id":"halkali-leke","ad":"Halkalı leke","tur":"hastalik","zaman":"","kaynak":"zeytinEMTT"},{"id":"zeytin-dal-kanseri","ad":"Zeytin dal kanseri","tur":"hastalik","aylar":[12],"zaman":"","kaynak":"zeytinEMTT"}]},{"key":"elma","ad":"Elma, armut, ayva","urunler":["Elma","Armut","Ayva"],"kapsam":"genis","girdiler":[{"id":"ates-yanikligi","ad":"Ateş yanıklığı","tur":"hastalik","zaman":"","kaynak":"elmaGKGM"},{"id":"elma-kara-leke","ad":"Elma kara lekesi","tur":"hastalik","zaman":"","kaynak":"elmaGKGM"},{"id":"elma-kulleme","ad":"Elma küllemesi","tur":"hastalik","aylar":[5,6],"zaman":"","kaynak":"elmaGKGM"},{"id":"virgul-kabuklubiti","ad":"Virgül kabuklubiti","tur":"zararli","aylar":[4,5,7],"mevsim":["kis"],"zaman":"","kaynak":"elmaGKGM"},{"id":"altin-kelebek","ad":"Altın kelebek","tur":"zararli","mevsim":["kis"],"zaman":"","kaynak":"elmaGKGM"},{"id":"yuzuk-kelebegi","ad":"Yüzük kelebeği","tur":"zararli","aylar":[4],"mevsim":["kis"],"zaman":"","kaynak":"elmaGKGM"},{"id":"tomurcuk-tirtillari","ad":"Tomurcuk tırtılları","tur":"zararli","zaman":"","kaynak":"elmaGKGM"},{"id":"elma-agkurdu","ad":"Elma ağkurdu","tur":"zararli","aylar":[3,4],"zaman":"","kaynak":"elmaGKGM"},{"id":"yaprak-galerigueveleri","ad":"Yaprak galerigüveleri","tur":"zararli","aylar":[4,5,7,8,9],"zaman":"","kaynak":"elmaGKGM"},{"id":"yaprakbukenler","ad":"Yaprakbükenler","tur":"zararli","mevsim":["ilkbahar"],"zaman":"","kaynak":"elmaGKGM"},{"id":"elma-yaprakbitleri","ad":"Yaprakbitleri","tur":"zararli","zaman":"","kaynak":"elmaGKGM"},{"id":"san-jose","ad":"San Jose kabuklubiti","tur":"zararli","mevsim":["kis"],"zaman":"","kaynak":"elmaGKGM"},{"id":"testereli-ari","ad":"Meyve testereliarısı","tur":"zararli","zaman":"","kaynak":"elmaGKGM"},{"id":"elma-pamuklubiti","ad":"Elma pamuklubiti","tur":"zararli","aylar":[5],"zaman":"","kaynak":"elmaGKGM"},{"id":"agac-kizilkurdu","ad":"Ağaç kızılkurdu","tur":"zararli","aylar":[8,9],"zaman":"","kaynak":"elmaGKGM"},{"id":"agac-sarikurdu","ad":"Ağaç sarıkurdu","tur":"zararli","mevsim":["sonbahar"],"zaman":"","kaynak":"elmaGKGM"},{"id":"elma-ickurdu","ad":"Elma içkurdu","tur":"zararli","zaman":"","kaynak":"elmaGKGM"},{"id":"dogu-meyveguvesi","ad":"Doğu meyvegüvesi","tur":"zararli","zaman":"","kaynak":"dmgBKU"},{"id":"elma-govdekurdu","ad":"Elma gövdekurdu","tur":"zararli","aylar":[3,4],"zaman":"","kaynak":"elmaGKGM"},{"id":"elma-kirmiziorumcek","ad":"Kırmızıörümcekler","tur":"zararli","zaman":"","kaynak":"elmaGKGM"},{"id":"armut-kaplani","ad":"Armut kaplanı","tur":"zararli","aylar":[4,6],"zaman":"","kaynak":"elmaGKGM"},{"id":"meyve-gozkurtlari","ad":"Meyve gözkurtları","tur":"zararli","aylar":[3],"zaman":"","kaynak":"elmaGKGM"},{"id":"elma-pasakari","ad":"Elma pasakarı","tur":"zararli","aylar":[5,8,9],"zaman":"","kaynak":"elmaGKGM"}]},{"key":"hububat","ad":"Buğday ve arpa","urunler":["Buğday","Arpa"],"kapsam":"genis","girdiler":[{"id":"sune","ad":"Süne","tur":"zararli","zaman":"","kaynak":"hububatGKGM"},{"id":"kimil","ad":"Kımıl","tur":"zararli","zaman":"","kaynak":"hububatGKGM"},{"id":"ekin-kambur","ad":"Ekin kambur böceği","tur":"zararli","mevsim":["sonbahar","ilkbahar"],"zaman":"","kaynak":"hububatGKGM"},{"id":"ekin-bambulu","ad":"Ekin bambulu","tur":"zararli","zaman":"","kaynak":"hububatGKGM"},{"id":"hortumlu-bocek","ad":"Hububat hortumlu böceği","tur":"zararli","zaman":"","kaynak":"hububatGKGM"},{"id":"septorya","ad":"Septorya yaprak lekesi","tur":"hastalik","zaman":"","kaynak":"hububatGKGM"},{"id":"pas","ad":"Buğday pasları","tur":"hastalik","zaman":"","kaynak":"hububatGKGM"},{"id":"tahil-kulleme","ad":"Tahıl küllemesi","tur":"hastalik","zaman":"","kaynak":"hububatGKGM"},{"id":"arpa-yaprak-yanikligi","ad":"Arpa yaprak yanıklığı (arpa)","tur":"hastalik","zaman":"","kaynak":"hububatGKGM"}]},{"key":"bag","ad":"Bağ","urunler":["Üzüm"],"kapsam":"genis","girdiler":[{"id":"bag-kulleme","ad":"Bağ küllemesi","tur":"hastalik","zaman":"","kaynak":"bagGKGM"},{"id":"bag-mildiyo","ad":"Bağ mildiyösü","tur":"hastalik","zaman":"","kaynak":"bagGKGM"},{"id":"olukol","ad":"Ölükol","tur":"hastalik","zaman":"","kaynak":"bagGKGM"},{"id":"bag-kursuni-kuf","ad":"Kurşuni küf","tur":"hastalik","zaman":"","kaynak":"bagGKGM"},{"id":"salkim-guvesi","ad":"Salkım güvesi","tur":"zararli","zaman":"","kaynak":"bagGKGM"},{"id":"bag-kirmiziorumcek","ad":"Kırmızıörümcek","tur":"zararli","aylar":[4],"zaman":"","kaynak":"bagGKGM"},{"id":"maymuncuk","ad":"Bağ maymuncukları","tur":"zararli","mevsim":["ilkbahar"],"zaman":"","kaynak":"bagGKGM"},{"id":"bag-thrips","ad":"Thripsler","tur":"zararli","mevsim":["ilkbahar"],"zaman":"","kaynak":"bagGKGM"},{"id":"bag-yaprakpiresi","ad":"Yaprakpireleri","tur":"zararli","zaman":"","kaynak":"bagGKGM"},{"id":"salkim-hortumlu","ad":"Salkım hortumlu böceği","tur":"zararli","zaman":"","kaynak":"bagGKGM"},{"id":"asma-agustosbocegi","ad":"Asma ağustosböceği","tur":"zararli","aylar":[6,7,8],"zaman":"","kaynak":"bagGKGM"},{"id":"bag-gozkurdu","ad":"Bağ gözkurdu","tur":"zararli","zaman":"","kaynak":"bagGKGM"},{"id":"bag-uvezi","ad":"Bağ üvezi","tur":"zararli","zaman":"","kaynak":"bagGKGM"}]},{"key":"domates","ad":"Domates (açık alan)","urunler":["Domates"],"kapsam":"genis","girdiler":[{"id":"domates-guvesi","ad":"Domates güvesi","tur":"zararli","zaman":"","kaynak":"domatesGKGM"},{"id":"domates-yesilkurt","ad":"Yeşilkurt","tur":"zararli","zaman":"","kaynak":"domatesGKGM"},{"id":"domates-yaprakpireleri","ad":"Yaprakpireleri","tur":"zararli","zaman":"","kaynak":"acikDomatesEMTT"},{"id":"galerisinegi","ad":"Yaprak galerisinekleri","tur":"zararli","zaman":"","kaynak":"domatesGKGM"},{"id":"domates-kirmiziorumcek","ad":"Kırmızıörümcekler","tur":"zararli","zaman":"","kaynak":"domatesGKGM"},{"id":"domates-thrips","ad":"Thripsler","tur":"zararli","zaman":"","kaynak":"domatesGKGM"},{"id":"domates-bozkurt","ad":"Bozkurt","tur":"zararli","zaman":"","kaynak":"domatesGKGM"},{"id":"domates-telkurdu","ad":"Telkurdu","tur":"zararli","mevsim":["ilkbahar"],"zaman":"","kaynak":"domatesGKGM"},{"id":"domates-mildiyo","ad":"Domates mildiyösü","tur":"hastalik","zaman":"","kaynak":"domatesGKGM"},{"id":"erken-yaniklik","ad":"Erken yanıklık","tur":"hastalik","zaman":"","kaynak":"domatesGKGM"},{"id":"domates-kulleme","ad":"Külleme","tur":"hastalik","zaman":"","kaynak":"domatesGKGM"},{"id":"domates-kursuni-kuf","ad":"Kurşuni küf","tur":"hastalik","zaman":"","kaynak":"domatesGKGM"}]},{"key":"patates","ad":"Patates","urunler":["Patates"],"kapsam":"kismi","girdiler":[{"id":"patates-mildiyo","ad":"Patates mildiyösü","tur":"hastalik","zaman":"","kaynak":"patatesMildiyoBKU"},{"id":"patates-bocegi","ad":"Patates böceği","tur":"zararli","zaman":"","kaynak":"patatesBocegiBKU"}]},{"key":"kiraz","ad":"Kiraz ve vişne","urunler":["Kiraz","Vişne"],"kapsam":"kismi","girdiler":[{"id":"kiraz-sinegi","ad":"Kiraz sineği","tur":"zararli","aylar":[4,5],"zaman":"","kaynak":"kirazVisneEMTT"},{"id":"kiraz-monilya","ad":"Çiçek monilyası","tur":"hastalik","mevsim":["ilkbahar"],"zaman":"","kaynak":"kirazGKGM"}]},{"key":"kayisi","ad":"Kayısı","urunler":["Kayısı"],"kapsam":"kismi","girdiler":[{"id":"kayisi-monilya","ad":"Çiçek monilyası","tur":"hastalik","mevsim":["ilkbahar"],"zaman":"","kaynak":"kirazGKGM"},{"id":"kayisi-cil","ad":"Çil (yaprak delen)","tur":"hastalik","mevsim":["sonbahar","ilkbahar"],"zaman":"","kaynak":"kayisiGKGM"},{"id":"kayisi-cil-nem","ad":"Çil ve monilya riski","tur":"hastalik","zaman":"","kaynak":"kayisiGKGM"},{"id":"kayisi-seftali-guvesi","ad":"Şeftali güvesi","tur":"zararli","zaman":"","kaynak":"seftaliGuvesiBKU"}]},{"key":"findik","ad":"Fındık","urunler":["Fındık"],"kapsam":"genis","girdiler":[{"id":"findik-kurdu","ad":"Fındık kurdu","tur":"zararli","aylar":[3,4,5],"zaman":"","kaynak":"findikGKGM"},{"id":"dalkiran","ad":"Dalkıran","tur":"zararli","aylar":[3,6,7,8],"zaman":"","kaynak":"findikGKGM"},{"id":"kahverengi-kosnil","ad":"Fındık kahverengi koşnili","tur":"zararli","aylar":[7,8],"zaman":"","kaynak":"findikGKGM"},{"id":"kozalak-akari","ad":"Kozalak akarı","tur":"zararli","aylar":[3,4],"zaman":"","kaynak":"findikGKGM"},{"id":"yesil-kokarca","ad":"Yeşil kokarca","tur":"zararli","aylar":[3,4,7],"zaman":"","kaynak":"findikGKGM"},{"id":"teke-bocegi","ad":"Fındık teke böceği","tur":"zararli","aylar":[5,6,7],"zaman":"","kaynak":"findikGKGM"},{"id":"abd-beyaz-kelebek","ad":"Amerikan beyaz kelebeği","tur":"zararli","aylar":[5,7],"zaman":"","kaynak":"findikGKGM"},{"id":"filiz-guvesi","ad":"Fındık filiz güvesi","tur":"zararli","aylar":[5],"zaman":"","kaynak":"findikGKGM"},{"id":"findik-virgul","ad":"Virgül kabuklubiti","tur":"zararli","aylar":[2,3,5],"zaman":"","kaynak":"findikGKGM"},{"id":"galsinegi","ad":"Fındık galsineği","tur":"zararli","aylar":[3,4,5],"zaman":"","kaynak":"findikGKGM"},{"id":"yaprakdeleni","ad":"Fındık yaprakdeleni","tur":"zararli","aylar":[3],"zaman":"","kaynak":"findikGKGM"},{"id":"bakteriyel-yaniklik","ad":"Bakteriyel yanıklık","tur":"hastalik","mevsim":["sonbahar","ilkbahar"],"zaman":"","kaynak":"findikGKGM"},{"id":"findik-kulleme","ad":"Külleme","tur":"hastalik","zaman":"","kaynak":"findikGKGM"}]},{"key":"misir","ad":"Mısır","urunler":["Mısır","Şeker Mısırı"],"kapsam":"genis","girdiler":[{"id":"kocankurdu","ad":"Mısır koçankurdu","tur":"zararli","aylar":[3],"zaman":"","kaynak":"misirGKGM"},{"id":"misirkurdu","ad":"Mısırkurdu","tur":"zararli","aylar":[4,5],"zaman":"","kaynak":"misirGKGM"},{"id":"misir-maymuncugu","ad":"Mısır maymuncuğu","tur":"zararli","aylar":[3,4,5,6],"zaman":"","kaynak":"misirGKGM"},{"id":"misir-bozkurt","ad":"Bozkurt","tur":"zararli","aylar":[4],"zaman":"","kaynak":"misirGKGM"},{"id":"cizgili-yaprakkurdu","ad":"Çizgili yaprakkurdu","tur":"zararli","aylar":[4],"zaman":"","kaynak":"misirGKGM"},{"id":"danaburnu","ad":"Danaburnu","tur":"zararli","aylar":[5,6],"zaman":"","kaynak":"misirGKGM"},{"id":"telkurtlari","ad":"Tel kurtları","tur":"zararli","aylar":[9,10],"zaman":"","kaynak":"misirGKGM"},{"id":"misir-yesilkurt","ad":"Yeşilkurt","tur":"zararli","zaman":"","kaynak":"misirGKGM"},{"id":"misir-yabanci-ot","ad":"Yabancı otlar","tur":"yabanciot","zaman":"","kaynak":"misirGKGM"}]},{"key":"pamuk","ad":"Pamuk","urunler":["Pamuk","Çukurova Pamuğu"],"kapsam":"kismi","girdiler":[{"id":"pamuk-genel","ad":"Genel sürvey","tur":"zararli","zaman":"","kaynak":"pamukEMTT"},{"id":"pamuk-thrips","ad":"Tütün thripsi","tur":"zararli","zaman":"","kaynak":"tutunTripsiBKU"},{"id":"pamuk-yaprakpireleri","ad":"Yaprakpireleri","tur":"zararli","zaman":"","kaynak":"pamukEMTT"},{"id":"pamuk-yesilkurt","ad":"Yeşilkurt","tur":"zararli","zaman":"","kaynak":"pamukEMTT"},{"id":"pembekurt","ad":"Pembekurt","tur":"zararli","zaman":"","kaynak":"pamukGapTeyap"}]},{"key":"aycicegi","ad":"Ayçiçeği","urunler":["Ayçiçeği"],"kapsam":"kismi","girdiler":[{"id":"aycicegi-ana","ad":"Ana sorunlar","tur":"hastalik","zaman":"","kaynak":"aycicegiEMTT"},{"id":"aycicegi-yabanci-ot","ad":"Yabancı otlar","tur":"yabanciot","zaman":"","kaynak":"yabanciOtTagem"},{"id":"aycicegi-guvesi","ad":"Avrupa ayçiçeği güvesi","tur":"zararli","zaman":"","kaynak":"endustriZararliTagem"},{"id":"aycicegi-bozkurt","ad":"Bozkurtlar","tur":"zararli","zaman":"","kaynak":"endustriZararliTagem"},{"id":"aycicegi-yesilkurt","ad":"Yeşilkurt","tur":"zararli","aylar":[4,5],"zaman":"","kaynak":"endustriZararliTagem"}]}];

const fold = (value: string) => value.trim().toLocaleLowerCase('tr-TR')
  .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .replace(/\s+/g, ' ');

/** Tarladaki ürün adına göre takvim; yoksa null. */
export function calendarForCrop(crop: string | null | undefined): CropCalendar | null {
  if (!crop) return null;
  const key = fold(crop);
  return PEST_CALENDARS.find((c) => c.urunler.some((u) => fold(u) === key)) ?? null;
}

/** Girdinin etkin olduğu aylar (kaynakta ay veya mevsim varsa). */
export function entryMonths(entry: PestEntry): number[] {
  const set = new Set<number>(entry.aylar ?? []);
  for (const s of entry.mevsim ?? []) for (const m of SEASON_MONTHS[s]) set.add(m);
  return [...set].sort((a, b) => a - b);
}

/** Ay bilgisi olanlar bu aya göre, olmayanlar "dönemine göre" grubunda. */
export function splitByMonth(cal: CropCalendar, month: number) {
  const thisMonth: PestEntry[] = [];
  const phenology: PestEntry[] = [];
  const other: PestEntry[] = [];
  for (const e of cal.girdiler) {
    const months = entryMonths(e);
    if (!months.length) phenology.push(e);
    else if (months.includes(month)) thisMonth.push(e);
    else other.push(e);
  }
  return { thisMonth, phenology, other };
}
