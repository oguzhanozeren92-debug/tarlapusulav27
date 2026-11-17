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

export const PEST_CALENDARS: CropCalendar[] = [
  {
    key: 'zeytin', ad: 'Zeytin', urunler: ['Zeytin'], kapsam: 'genis',
    girdiler: [
      { id: 'zeytin-sinegi', ad: 'Zeytin sineği', latince: 'Bactrocera oleae', tur: 'zararli', aylar: [6, 7, 8],
        zaman: 'Tuzaklar haziran sonu–temmuz başından itibaren asılır; vuruk kontrolleri temmuz–ağustosta yapılır.',
        izleme: 'McPhail ve feromonlu sarı yapışkan tuzak; vuruk kontrolünde 800–1000 meyve incelenir.',
        esik: 'Salamuralık çeşitlerde %1, yağlık çeşitlerde %3–4 vuruk.', kaynak: 'zeytinEMTT', sayfa: '12, 20' },
      { id: 'zeytin-guvesi', ad: 'Zeytin güvesi', latince: 'Prays oleae', tur: 'zararli', aylar: [3],
        zaman: 'Delta tipi feromon tuzağı mart başında asılır. Çiçek dölünde karar, ilk kelebeklerin yakalanmasından 7–10 gün sonra.',
        izleme: 'Delta feromon tuzağı.', esik: 'Yaprak ve yeni sürgünlerde %10’dan fazla zarar.', kaynak: 'zeytinEMTT', sayfa: '12, 26' },
      { id: 'fidantirtili', ad: 'Fidantırtılı', latince: 'Palpita unionalis', tur: 'zararli', aylar: [4, 5, 6, 7, 8, 9, 10, 11],
        zaman: 'Nisandan başlayıp kasım ayına kadar izlenir.', esik: '%10 canlı larva veya bulaşık sürgün.', kaynak: 'zeytinEMTT', sayfa: '28' },
      { id: 'pamuklubit', ad: 'Zeytin pamuklubiti', latince: 'Euphyllura spp.', tur: 'zararli',
        zaman: 'Sürgün uçlarında ilk pamuklanma görüldükten 10 gün sonra; çiçeklenmeye kadar.', kaynak: 'zeytinEMTT', sayfa: '30' },
      { id: 'kabuklubit', ad: 'Zeytin kabuklubiti', latince: 'Parlatoria oleae', tur: 'zararli', aylar: [7, 8],
        zaman: 'Kontroller temmuz sonu–ağustos başından itibaren; karar zamanı yumurtaların %50’sinin açıldığı dönem.', kaynak: 'zeytinEMTT', sayfa: '32' },
      { id: 'karakosnil', ad: 'Karakoşnil', latince: 'Saissetia oleae', tur: 'zararli', aylar: [5, 6],
        zaman: 'Mayıs sonlarından itibaren, yumurtaların %50’sinin açıldığı devre.',
        esik: '80–100 cm’lik sürgünde ortalama 4–6 ergin dişi.', kaynak: 'zeytinEMTT', sayfa: '35' },
      { id: 'cicek-sap-sokanlari', ad: 'Çiçek sap sokanları', latince: 'Calocoris spp.', tur: 'zararli', aylar: [4, 5],
        zaman: 'Nisan sonu–mayıs başı.', esik: 'Ağaç başına 25 civarında zararlı.', kaynak: 'zeytinEMTT', sayfa: '38' },
      { id: 'zeytin-pasakarlari', ad: 'Pasakarları', latince: 'Aceria oleae, Aculus olearius', tur: 'zararli', aylar: [4],
        zaman: 'Nisan ayından itibaren haftalık kontrol.', esik: 'Yaprak veya tomurcuk başına ortalama 5–10 hareketli birey.', kaynak: 'zeytinEMTT', sayfa: '40' },
      { id: 'halkali-leke', ad: 'Halkalı leke', latince: 'Spilocaea oleagina', tur: 'hastalik',
        zaman: 'Uygulamalar yağışların hemen öncesine veya sonrasına denk getirilir.', kaynak: 'zeytinEMTT', sayfa: '23' },
      { id: 'zeytin-dal-kanseri', ad: 'Zeytin dal kanseri', latince: 'Pseudomonas savastanoi', tur: 'hastalik', aylar: [12],
        zaman: 'Talimatta dört uygulama zamanı var; biri aralık sonunda, hasattan hemen sonra.', kaynak: 'zeytinEMTT', sayfa: '44' },
    ],
  },
  {
    key: 'elma', ad: 'Elma, armut, ayva', urunler: ['Elma', 'Armut', 'Ayva'], kapsam: 'genis',
    girdiler: [
      { id: 'ates-yanikligi', ad: 'Ateş yanıklığı', latince: 'Erwinia amylovora', tur: 'hastalik',
        zaman: 'Çiçeklenme başlangıcından itibaren 7–8 gün arayla; tahmin-uyarı varsa uyarıdan, ayrıca fırtına/dolu sonrası 24 saat içinde.', kaynak: 'elmaGKGM', sayfa: '20–21' },
      { id: 'elma-kara-leke', ad: 'Elma kara lekesi', latince: 'Venturia inaequalis', tur: 'hastalik',
        zaman: 'Çiçek gözleri kabardığında, pembe rozet tomurcuk döneminde, çiçek taç yapraklarının %70–80’i döküldüğünde; sonrası il tahmin-uyarı duyurularına göre.', kaynak: 'elmaGKGM', sayfa: '31–33' },
      { id: 'elma-kulleme', ad: 'Elma küllemesi', latince: 'Podosphaera leucotricha', tur: 'hastalik', aylar: [5, 6],
        zaman: 'Pembe çiçek tomurcuğu döneminde ve taç yaprakların %60–70’i döküldüğünde; mayıs sonuna kadar haftada bir, haziranın üçüncü haftasına kadar 10 günde bir.', kaynak: 'elmaGKGM', sayfa: '34–35' },
      { id: 'virgul-kabuklubiti', ad: 'Virgül kabuklubiti', latince: 'Lepidosaphes ulmi', tur: 'zararli', aylar: [4, 5, 7], mevsim: ['kis'],
        zaman: 'Kışın sayım; kış uygulaması gözler kabarmadan 2–3 hafta önce. Larva çıkışı nisan sonu–mayıs; yaz kararı yumurta açılımından en geç 7–10 gün sonra.',
        esik: 'Kış: 5 cm sürgünde en az 5 yumurtalı dişi. Yaz: en az 5 canlı yumurtalı kabuk.', kaynak: 'elmaGKGM', sayfa: '37–38' },
      { id: 'altin-kelebek', ad: 'Altın kelebek', latince: 'Euproctis chrysorrhoea', tur: 'zararli', mevsim: ['kis'],
        zaman: 'Kışın kışlık yuvalar sayılır; larvalar gözler patlamaya başlarken yuvadan çıkar.',
        esik: 'Ağaçların en az %30’u bulaşık ve bunların en az %10’unda ağaç başına 15–20 ve üzeri yuva.', kaynak: 'elmaGKGM', sayfa: '38–39' },
      { id: 'yuzuk-kelebegi', ad: 'Yüzük kelebeği', latince: 'Malacosoma neustria', tur: 'zararli', aylar: [4], mevsim: ['kis'],
        zaman: 'Kışın yumurta kümeleri sayılır; nisan ortalarına doğru larva çıkışı başlar, karar larvalar kümeleri tamamen terk edince.',
        esik: 'Ağaçların %30’undan fazlası bulaşık ve bunların en az %10’unda 15–20 ve üzeri yumurta kümesi.', kaynak: 'elmaGKGM', sayfa: '39–41' },
      { id: 'tomurcuk-tirtillari', ad: 'Tomurcuk tırtılları', latince: 'Hedya nubiferana, Spilonota ocellana', tur: 'zararli',
        zaman: 'Çiçek tomurcuklarının görüldüğü dönemde, en geç pembe çiçek tomurcuğunda.',
        izleme: '10 dekarda 5 ağaç × 20 tomurcuk.', esik: '10–15 larva.', kaynak: 'elmaGKGM', sayfa: '41–42' },
      { id: 'elma-agkurdu', ad: 'Elma ağkurdu', latince: 'Yponomeuta malinellus', tur: 'zararli', aylar: [3, 4],
        zaman: 'Larvalar mart sonu–nisan başı çıkar; karar çiçeklenme öncesi ya da taç yaprakların %70–80’i döküldükten sonra.',
        esik: '100 yaprakta 4 canlı larva kolonisi.', kaynak: 'elmaGKGM', sayfa: '46–47' },
      { id: 'yaprak-galerigueveleri', ad: 'Yaprak galerigüveleri', latince: 'Phyllonorycter, Stigmella', tur: 'zararli', aylar: [4, 5, 7, 8, 9],
        zaman: 'Nisan ortasından itibaren sayım; ilk karar nisan ortası–mayıs, sonra temmuz–ağustos ve eylül başı.',
        izleme: '5 ağaçtan 20’şer yaprak.', esik: 'Parazitlenme düşükken yaprak başına en az 4 canlı larva.', kaynak: 'elmaGKGM', sayfa: '48–49' },
      { id: 'yaprakbukenler', ad: 'Yaprakbükenler', latince: 'Archips rosanus, A. xylosteanus', tur: 'zararli', mevsim: ['ilkbahar'],
        zaman: 'Pembe tomurcuk dönemi. Tuzaklar kelebek çıkışından bir hafta sonra.',
        esik: 'Ağaçta 5’ten fazla yumurta paketi ve erken ilkbaharda tomurcukların %5’inden fazlasında larva.', kaynak: 'elmaGKGM', sayfa: '49–50' },
      { id: 'elma-yaprakbitleri', ad: 'Yaprakbitleri', latince: 'Aphis pomi, Dysaphis spp.', tur: 'zararli',
        zaman: 'Gri ve kırmızı gal yaprakbitinde pembe tomurcuk veya taç yaprak dökümü sonrası.',
        esik: 'Yeşil elma yaprakbiti: 100 sürgünde 15 bulaşık. Gri: 100 sürgünde 1 koloni. Kırmızı gal: 100 sürgünde 5.', kaynak: 'elmaGKGM', sayfa: '51–52' },
      { id: 'san-jose', ad: 'San Jose kabuklubiti', latince: 'Quadraspidiotus perniciosus', tur: 'zararli', mevsim: ['kis'],
        zaman: 'Kış uykusunda, en geç gözler uyanmadan iki hafta önceye kadar; hava 5 °C üstünde ve yağışsız. Yaz kararı çiçeklenme sonrası larva çıkışında; ağustostan itibaren uygulama yapılmaz.', kaynak: 'elmaGKGM', sayfa: '52–54' },
      { id: 'testereli-ari', ad: 'Meyve testereliarısı', latince: 'Hoplocampa spp.', tur: 'zararli',
        zaman: 'Taç yapraklar dökülmeye başlarken kontrol; karar yumurtalar açılmaya başlayınca.',
        izleme: 'Erkenci 5 ağaçtan 20 salkım.', esik: 'Bulaşma oranı %10’un üzerinde.', kaynak: 'elmaGKGM', sayfa: '54–55' },
      { id: 'elma-pamuklubiti', ad: 'Elma pamuklubiti', latince: 'Eriosoma lanigerum', tur: 'zararli', aylar: [5],
        zaman: 'Mayıstan itibaren kontrol.', esik: 'Sürgünlerin %10’unda koloni.', kaynak: 'elmaGKGM', sayfa: '58–59' },
      { id: 'agac-kizilkurdu', ad: 'Ağaç kızılkurdu', latince: 'Cossus cossus', tur: 'zararli', aylar: [8, 9],
        zaman: 'Ağustos ortası–eylül başı; erginler çıkışını bitirince veya genç larvalar görülünce.', izleme: 'Feromon tuzağı.', kaynak: 'elmaGKGM', sayfa: '59–60' },
      { id: 'agac-sarikurdu', ad: 'Ağaç sarıkurdu', latince: 'Zeuzera pyrina', tur: 'zararli', mevsim: ['sonbahar'],
        zaman: 'Sonbaharda yaprak dökümünden sonra giriş deliklerinde talaş aranır.', esik: 'Bulaşık her ağaç.', kaynak: 'elmaGKGM', sayfa: '60–61' },
      { id: 'elma-ickurdu', ad: 'Elma içkurdu', latince: 'Cydia pomonella', tur: 'zararli',
        zaman: 'Yumurta bırakma için akşam alacakaranlık sıcaklığının üst üste iki gün 15 °C’nin üzerinde olması gerekir.',
        izleme: 'Feromon tuzağı, 500 meyve kontrolü, tuzak bant.', kaynak: 'elmaGKGM', sayfa: '62–63' },
      { id: 'dogu-meyveguvesi', ad: 'Doğu meyvegüvesi', latince: 'Grapholita molesta', tur: 'zararli',
        zaman: 'Tuzaklarda ergin yakalanmasından sonraki etkili sıcaklık toplamı izlenir.',
        izleme: 'Eşeysel çekici (feromon) tuzak.',
        gunDerece: { hedef: 400, anlam: 'talimattaki ikinci uygulama zamanı' }, kaynak: 'dmgBKU' },
      { id: 'elma-govdekurdu', ad: 'Elma gövdekurdu', latince: 'Synanthedon myopaeformis', tur: 'zararli', aylar: [3, 4],
        zaman: 'Mart veya nisanda en az 20 ağaç kontrol edilir; uçuşta feromon tuzak.', esik: 'Ağaç başına 5’ten fazla canlı larva.', kaynak: 'elmaGKGM', sayfa: '64–65' },
      { id: 'elma-kirmiziorumcek', ad: 'Kırmızıörümcekler', latince: 'Panonychus ulmi, Tetranychus spp.', tur: 'zararli',
        zaman: 'Doğal düşmanlar zayıfken.', izleme: '10 ağaç × 100 yaprak.', esik: 'Yaprak başına 8–10’dan fazla.', kaynak: 'elmaGKGM', sayfa: '66–67' },
      { id: 'armut-kaplani', ad: 'Armut kaplanı', latince: 'Stephanitis pyri', tur: 'zararli', aylar: [4, 6],
        zaman: 'Nisandan itibaren 10 ağaç; ikinci sayım haziranda.', esik: 'Yaprakta 0,5–1 ergin.', kaynak: 'elmaGKGM', sayfa: '68' },
      { id: 'meyve-gozkurtlari', ad: 'Meyve gözkurtları', latince: 'Anthonomus spp.', tur: 'zararli', aylar: [3],
        zaman: 'Marttan itibaren 7–10 günde bir sürvey; ideal karar zamanı farekulağı dönemi.',
        esik: 'Ağaçta yaklaşık 10 zarar görmüş tomurcuk veya 100 darbede 30 ergin.', kaynak: 'elmaGKGM', sayfa: '71–72' },
      { id: 'elma-pasakari', ad: 'Elma pasakarı', latince: 'Aculus schlechtendali', tur: 'zararli', aylar: [5, 8, 9],
        zaman: 'Mayıstan itibaren 100 yaprak sayımı.', esik: 'Mayısta yaprakta 300–400; ağustos–eylülde 700–1000 akar.', kaynak: 'elmaGKGM', sayfa: '74–76' },
    ],
  },
  {
    key: 'hububat', ad: 'Buğday ve arpa', urunler: ['Buğday', 'Arpa'], kapsam: 'genis',
    girdiler: [
      { id: 'sune', ad: 'Süne', latince: 'Eurygaster spp.', tur: 'zararli',
        zaman: 'Hava 15 °C’yi bulunca kışlaktan tarlaya iner; asıl zarar süt ve sarı olumda. Karar, Bakanlık sürveyleri tamamlandıktan sonra.',
        esik: 'Metrekarede 10 ve daha fazla süne yavrusu (nimf).', kaynak: 'hububatGKGM', sayfa: '31–33' },
      { id: 'kimil', ad: 'Kımıl', latince: 'Aelia spp.', tur: 'zararli',
        zaman: 'Hava 20 °C olunca tarlaya geçer; zarar kardeşlenme ve başaklanmada.', esik: 'Metrekarede 2 kışlamış ergin.', kaynak: 'hububatGKGM', sayfa: '34–35' },
      { id: 'ekin-kambur', ad: 'Ekin kambur böceği', latince: 'Zabrus spp.', tur: 'zararli', mevsim: ['sonbahar', 'ilkbahar'],
        zaman: 'Önceki yıl bulaşık tarlalarda; geç sonbahar veya erken ilkbahar.', esik: 'Metrekarede 3–4 larva.', kaynak: 'hububatGKGM', sayfa: '36–37' },
      { id: 'ekin-bambulu', ad: 'Ekin bambulu', latince: 'Anisoplia spp.', tur: 'zararli',
        zaman: 'İlk ergin çıkışı belirlenir; erginler süt olum döneminde görülür.', esik: 'Metrekarede ortalama 3–4 ergin (sonbahar larva sayımında da aynı).', kaynak: 'hububatGKGM', sayfa: '37–38' },
      { id: 'hortumlu-bocek', ad: 'Hububat hortumlu böceği', latince: 'Pachytychius hordei', tur: 'zararli',
        zaman: 'Çıkıştan yaklaşık 10 gün sonra başlar, sapa kalkma devresinde biter.', esik: 'Metrekarede ortalama 5 veya daha fazla böcek.', kaynak: 'hububatGKGM', sayfa: '38–39' },
      { id: 'septorya', ad: 'Septorya yaprak lekesi', latince: 'Septoria tritici', tur: 'hastalik',
        zaman: 'Kardeşlenmeden itibaren yağışlı hava uzarsa risk artar; en uygun zaman bayrak yaprağın tamamen açıldığı kın dönemi sonu veya başak çıkışı öncesi.', kaynak: 'hububatGKGM', sayfa: '25–26' },
      { id: 'pas', ad: 'Buğday pasları', latince: 'Puccinia spp.', tur: 'hastalik',
        zaman: 'En erken sarı pas görülür; kahverengi pas ondan sonra, kara pastan önce gelir.', kaynak: 'hububatGKGM', sayfa: '20–21' },
      { id: 'tahil-kulleme', ad: 'Tahıl küllemesi', latince: 'Erysiphe graminis', tur: 'hastalik',
        zaman: 'Belirtiler görülmeye başlayınca, yoğunlaşmadan.', kaynak: 'hububatGKGM', sayfa: '23–24' },
      { id: 'arpa-yaprak-yanikligi', ad: 'Arpa yaprak yanıklığı (arpa)', latince: 'Rhynchosporium secalis', tur: 'hastalik',
        zaman: '4–25 °C ve yağmurlu havada bulaşır, 30 °C üstünde bulaşmaz; lekeler ilk görüldüğünde.', kaynak: 'hububatGKGM', sayfa: '29–30' },
    ],
  },
  {
    key: 'bag', ad: 'Bağ', urunler: ['Üzüm'], kapsam: 'genis',
    girdiler: [
      { id: 'bag-kulleme', ad: 'Bağ küllemesi', latince: 'Uncinula necator', tur: 'hastalik',
        zaman: 'İlk uygulama sürgünler 25–30 cm iken, ikincisi çiçek taç yaprakları dökülünce; ben düşmeye kadar. 18 °C altında etkinlik düşer.', kaynak: 'bagGKGM', sayfa: '16–17' },
      { id: 'bag-mildiyo', ad: 'Bağ mildiyösü', latince: 'Plasmopara viticola', tur: 'hastalik',
        zaman: 'İlk uygulama sürgünler 25–30 cm iken; sonrası sıcaklık, yağış, nem ve çiğ hastalığa uygun oldukça. Tahmin-uyarı istasyonu olan yerlerde duyurulara göre.', kaynak: 'bagGKGM', sayfa: '19–20' },
      { id: 'olukol', ad: 'Ölükol', latince: 'Phomopsis viticola', tur: 'hastalik',
        zaman: 'Budamadan sonra gözler açılmadan; yazın sürgünler 2–3, 8–10 ve 25–30 cm iken.', kaynak: 'bagGKGM', sayfa: '25–26' },
      { id: 'bag-kursuni-kuf', ad: 'Kurşuni küf', latince: 'Botrytis cinerea', tur: 'hastalik',
        zaman: 'İlk uygulama olgunlaşma başlangıcında; sonuncusu hasada göre planlanır.', kaynak: 'bagGKGM', sayfa: '20–21' },
      { id: 'salkim-guvesi', ad: 'Salkım güvesi', latince: 'Lobesia botrana', tur: 'zararli',
        zaman: 'Feromon tuzaklarla izlenir; ilk yumurta ve larva çıkışını il tahmin-uyarı servisi duyurur. Çiftleşmeyi engelleme yöntemi tuzakta ilk kelebek yakalanınca başlar.',
        esik: '1. dölde bulaşma %5’in üzerindeyse biyolojik mücadele de eklenir.', kaynak: 'bagGKGM', sayfa: '26–29' },
      { id: 'bag-kirmiziorumcek', ad: 'Kırmızıörümcek', latince: 'Tetranychus urticae', tur: 'zararli', aylar: [4],
        zaman: 'Nisanda sıcaklık artınca kışlaktan çıkar; yaprak sayımı.', esik: 'Yaprak başına 5–8 akar.', kaynak: 'bagGKGM', sayfa: '29–30' },
      { id: 'maymuncuk', ad: 'Bağ maymuncukları', latince: 'Otiorhynchus spp.', tur: 'zararli', mevsim: ['ilkbahar'],
        zaman: 'Erken ilkbahar çıkışında haftada iki kez; köşe ve ortadan 25 asma.', esik: '25 asmanın 10’unda zararlı veya zarar.', kaynak: 'bagGKGM', sayfa: '31–33' },
      { id: 'bag-thrips', ad: 'Thripsler', tur: 'zararli', mevsim: ['ilkbahar'],
        zaman: 'İlkbaharda 20–50 asma incelenir.', esik: 'Tomurcuk veya açılan yaprak başına 2–3 thrips.', kaynak: 'bagGKGM', sayfa: '33–34' },
      { id: 'bag-yaprakpiresi', ad: 'Yaprakpireleri', latince: 'Asymmetrasca decedens, Empoasca decipiens', tur: 'zararli',
        zaman: 'Nimfler ilk görüldüğünde.', esik: 'Yaprak başına 5 birey.', kaynak: 'bagGKGM', sayfa: '40' },
      { id: 'salkim-hortumlu', ad: 'Salkım hortumlu böceği', latince: 'Strophomorphus ctenotus', tur: 'zararli',
        zaman: 'Geçmişte görülen bağlarda, salkımların ayrılmasından tane nohut iriliğine kadar haftada iki kez; 5 noktada 5’er asma.', esik: '25 asmanın 1’inde zararlı veya zarar.', kaynak: 'bagGKGM', sayfa: '42–44' },
      { id: 'asma-agustosbocegi', ad: 'Asma ağustosböceği', latince: 'Chloropsalta viridissima', tur: 'zararli', aylar: [6, 7, 8],
        zaman: 'Erginler haziran sonu–ağustos başı; yumurtalı sürgünler ağustosta kesilir.', izleme: '100 sürgünde pembe yumurta aranır.',
        esik: 'Sürgünlerin %50’sinden fazlasında pembe yumurta.', kaynak: 'bagGKGM', sayfa: '45–46' },
      { id: 'bag-gozkurdu', ad: 'Bağ gözkurdu', latince: 'Theresimima ampelophaga', tur: 'zararli',
        zaman: 'Geçen yıl bulaşık bağlarda göz uyanmasında sayım.', esik: '100 gözde 5 zararlı veya zarar.', kaynak: 'bagGKGM', sayfa: '47–48' },
      { id: 'bag-uvezi', ad: 'Bağ üvezi', latince: 'Arboridia adanae', tur: 'zararli',
        zaman: 'İlk yapraklar çıktıktan sonra; 25 dekarda 250 yaprak.', esik: '1. dölde yaprak başına 3–5, 2. dölde 5 ve üzeri nimf+ergin.', kaynak: 'bagGKGM', sayfa: '48–49' },
    ],
  },
  {
    key: 'domates', ad: 'Domates (açık alan)', urunler: ['Domates'], kapsam: 'genis',
    girdiler: [
      { id: 'domates-guvesi', ad: 'Domates güvesi', latince: 'Tuta absoluta', tur: 'zararli',
        zaman: 'Tuzakta ilk kelebek görülünce kitle yakalama tuzakları kurulur; bir döl 29–38 günde tamamlanır.',
        izleme: 'Tarlada hektara 1–2 delta tipi feromon tuzak.', esik: '100 bitkiden 3’ü yumurta ve tırtılla bulaşık.', kaynak: 'domatesGKGM', sayfa: '36–40' },
      { id: 'domates-yesilkurt', ad: 'Yeşilkurt', latince: 'Helicoverpa armigera', tur: 'zararli',
        zaman: 'İlk yeşil meyveler oluşunca giriş delikli meyveler toplanır.', esik: 'Bitkilerde %5 bulaşma.', kaynak: 'domatesGKGM', sayfa: '51' },
      { id: 'domates-yaprakpireleri', ad: 'Yaprakpireleri', latince: 'Empoasca decipiens, Asymmetrasca decedens', tur: 'zararli',
        zaman: 'Düzenli sürvey.', esik: 'Bitki başına ortalama 5 ergin+nimf.', kaynak: 'acikDomatesEMTT' },
      { id: 'galerisinegi', ad: 'Yaprak galerisinekleri', latince: 'Liriomyza spp.', tur: 'zararli',
        zaman: 'Üretim dönemi başında kimyasal kullanılmaz.', izleme: 'Dekara 1 sarı yapışkan tuzak.', esik: 'Yaprak başına 10 larva.', kaynak: 'domatesGKGM', sayfa: '49–50' },
      { id: 'domates-kirmiziorumcek', ad: 'Kırmızıörümcekler', latince: 'Tetranychus spp.', tur: 'zararli',
        zaman: 'Sıcak ve kurak dönemde.', esik: 'Büyük yapraklı sebzelerde yaprak başına 5 canlı birey.', kaynak: 'domatesGKGM', sayfa: '44–45' },
      { id: 'domates-thrips', ad: 'Thripsler', latince: 'Thrips tabaci, Frankliniella occidentalis', tur: 'zararli',
        zaman: 'Kurak yerlerde zarar fazla. Lekeli solgunluk virüsü varsa eşik beklenmez.', esik: 'Büyük yapraklı bitkilerde yaprak başına 20 thrips.', kaynak: 'domatesGKGM', sayfa: '46–47' },
      { id: 'domates-bozkurt', ad: 'Bozkurt', latince: 'Agrotis spp.', tur: 'zararli',
        zaman: 'Ekim ve dikim zamanında bitki dipleri kontrol edilir.', esik: 'Metrekarede 2–3 larva; dikimden sonra %1–3 larva veya kesik bitki.', kaynak: 'domatesGKGM', sayfa: '53–54' },
      { id: 'domates-telkurdu', ad: 'Telkurdu', latince: 'Agriotes spp.', tur: 'zararli', mevsim: ['ilkbahar'],
        zaman: 'İlkbaharda havalar ısınınca larvalar yüzeye yaklaşır.', esik: 'Metrekarede 6 ve daha fazla larva.', kaynak: 'domatesGKGM', sayfa: '55–56' },
      { id: 'domates-mildiyo', ad: 'Domates mildiyösü', latince: 'Phytophthora infestans', tur: 'hastalik', kural: 'mildiyo',
        zaman: 'Sıcaklık 19–22 °C ve orantılı nem %80 ve üzeri olunca salgın yapar; koşullar oluşur oluşmaz.', kaynak: 'domatesGKGM', sayfa: '27–28' },
      { id: 'erken-yaniklik', ad: 'Erken yanıklık', latince: 'Alternaria solani', tur: 'hastalik',
        zaman: 'Uygun sıcaklık 28–30 °C; ilk belirtiler görülür görülmez.', kaynak: 'domatesGKGM', sayfa: '29–30' },
      { id: 'domates-kulleme', ad: 'Külleme', latince: 'Leveillula taurica', tur: 'hastalik',
        zaman: 'İlk hastalık belirtileri görüldüğünde.', kaynak: 'domatesGKGM', sayfa: '32' },
      { id: 'domates-kursuni-kuf', ad: 'Kurşuni küf', latince: 'Botrytis cinerea', tur: 'hastalik',
        zaman: '20–25 °C ve %95–98 nem en uygun koşul; ilk belirtilerde veya çiçeklenmede.', kaynak: 'domatesGKGM', sayfa: '17–18' },
    ],
  },
  {
    key: 'patates', ad: 'Patates', urunler: ['Patates'], kapsam: 'kismi',
    girdiler: [
      { id: 'patates-mildiyo', ad: 'Patates mildiyösü', latince: 'Phytophthora infestans', tur: 'hastalik', kural: 'mildiyo',
        zaman: 'Bulaşmalar genellikle 16 °C’de; salgın 19–22 °C’de ve orantılı nem %80’in üstündeyken.', kaynak: 'patatesMildiyoBKU' },
      { id: 'patates-bocegi', ad: 'Patates böceği', latince: 'Leptinotarsa decemlineata', tur: 'zararli',
        zaman: 'Kışı toprakta ergin olarak geçirir; ilkbaharda çıkış 10 cm derinlikteki toprak sıcaklığı ortalamasının 13 °C’yi bulmasına bağlı. Gelişme eşiği 10,1 °C; Marmara’da yılda 3–4, Orta Anadolu’da 1,5 döl.',
        izleme: 'Ergin ve larvalar büyük olduğu için gözle kolay görülür; küçük alanlarda toplamak ve yumurtaları ezmek etkilidir.',
        not: 'Sayısal eşik için Patates Entegre Mücadele Teknik Talimatı’na veya il müdürlüğüne bakın.', kaynak: 'patatesBocegiBKU' },
    ],
  },
  {
    key: 'kiraz', ad: 'Kiraz ve vişne', urunler: ['Kiraz', 'Vişne'], kapsam: 'kismi',
    girdiler: [
      { id: 'kiraz-sinegi', ad: 'Kiraz sineği', latince: 'Rhagoletis cerasi', tur: 'zararli', aylar: [4, 5],
        zaman: 'Bölgeye göre nisan–mayısta, en erkenci çeşidin ben düşme döneminden bir hafta önce izleme tuzakları asılır. İl müdürlüklerinin duyurusuna göre karar, tuzakta ilk ergin görüldükten sonra en geç bir hafta içinde.',
        izleme: 'Dekara 2 sarı yapışkan tuzak + amonyak kapsülü; ağacın güneydoğu yönüne, 1,5–2 m yüksekliğe.',
        kaynak: 'kirazVisneEMTT', not: 'Tuzak yeri ve uygulama zamanı: Elazığ ve Malatya İl Müdürlükleri, ZMMAE çiftçi bülteni.' },
      { id: 'kiraz-monilya', ad: 'Çiçek monilyası', latince: 'Monilinia laxa', tur: 'hastalik', mevsim: ['ilkbahar'],
        zaman: 'Birincisi çiçeklenme başlangıcında (%5–10 çiçek), ikincisi tam çiçeklenmede (%90–100).', kaynak: 'kirazGKGM' },
    ],
  },
  {
    key: 'kayisi', ad: 'Kayısı', urunler: ['Kayısı'], kapsam: 'kismi',
    girdiler: [
      { id: 'kayisi-monilya', ad: 'Çiçek monilyası', latince: 'Monilinia laxa', tur: 'hastalik', mevsim: ['ilkbahar'],
        zaman: 'Kiraz-vişne talimatındaki zamanlama: çiçeklenme başlangıcında (%5–10) ve tam çiçeklenmede (%90–100). Talimat kayısıyı da konukçu sayar.',
        kaynak: 'kirazGKGM' },
      { id: 'kayisi-cil', ad: 'Çil (yaprak delen)', tur: 'hastalik', mevsim: ['sonbahar', 'ilkbahar'],
        zaman: 'Sonbaharda yaprak dökümünden hemen sonra (yaprakların %75–80’i dökülünce); ilkbaharda pembe çiçek tomurcuğu döneminde; meyvede çanak yaprak ve erkek organ tablası sıyrılırken (kürkü sıyırma). Mevsim çok yağışlı geçerse tekrar.',
        kaynak: 'kayisiGKGM', not: 'Yaprak dökümü oranı: Elazığ İl Müdürlüğü; kürkü sıyırma: Malatya İl Müdürlüğü.' },
      { id: 'kayisi-cil-nem', ad: 'Çil ve monilya riski', tur: 'hastalik',
        zaman: 'Hava nemi yüksek ve yağış fazlaysa çil ve monilya daha şiddetli olur.', kaynak: 'kayisiGKGM' },
      { id: 'kayisi-seftali-guvesi', ad: 'Şeftali güvesi', latince: 'Anarsia lineatella', tur: 'zararli',
        zaman: 'Larva meyve etine girmeden karar verilir. Tuzaklar haftada bir sayılır, kapsüller 4–6 haftada bir değişir.',
        izleme: 'Eşeysel çekici (feromon) tuzak + sürgün kontrolü.',
        esik: '1. döl: tuzakta haftada 20 kelebek ve ağaç başına 5 veya daha fazla bulaşık sürgün. Meyvede tolerans %2; erkenci kayısıda daha düşük.', kaynak: 'seftaliGuvesiBKU' },
    ],
  },
  {
    key: 'findik', ad: 'Fındık', urunler: ['Fındık'], kapsam: 'genis',
    girdiler: [
      { id: 'findik-kurdu', ad: 'Fındık kurdu', latince: 'Curculio nucum', tur: 'zararli', aylar: [3, 4, 5],
        zaman: 'İlk erginler mart başında, çıkış zirvesi mayıs başında; nisan sonunda silkeleme sayımı.',
        izleme: '10 dekarda 10 ocak, 3×5,5 m bez.', esik: 'Ocak başına 2 veya daha fazla ergin.', kaynak: 'findikGKGM', sayfa: '16–17' },
      { id: 'dalkiran', ad: 'Dalkıran', latince: 'Xyleborus dispar', tur: 'zararli', aylar: [3, 6, 7, 8],
        zaman: 'Hava 18–20 °C’ye çıkınca etkinleşir; ana çıkış haziran sonu–ağustos ilk haftası. Bulaşık dallar en geç marta kadar kesilir.',
        izleme: 'Kırmızı kanatlı yapışkan tuzak.', esik: 'Bulaşıklık %70–80 ise dekara 6–8, %30–40 ise 3–4 tuzak.', kaynak: 'findikGKGM', sayfa: '18–19' },
      { id: 'kahverengi-kosnil', ad: 'Fındık kahverengi koşnili', latince: 'Parthenolecanium spp.', tur: 'zararli', aylar: [7, 8],
        zaman: 'Popülasyonun %70–80’i çıkış yaptığında (temmuz başı–ağustos ortası).',
        izleme: '10 ocak, 3’er bulaşık sürgün.', esik: 'Sürgün başına ortalama 5 canlı koşnil.', kaynak: 'findikGKGM', sayfa: '20–21' },
      { id: 'kozalak-akari', ad: 'Kozalak akarı', latince: 'Phytoptus avellanae', tur: 'zararli', aylar: [3, 4],
        zaman: 'Akarlar marttan nisan başına göç eder; yeni tomurcuklar toplu iğne başının yarısı kadarken (nisan sonu).',
        izleme: '10 ocakta 10’ar dal.', esik: 'Dal başına ortalama 5 kozalak.', kaynak: 'findikGKGM', sayfa: '22–23' },
      { id: 'yesil-kokarca', ad: 'Yeşil kokarca', latince: 'Palomena prasina', tur: 'zararli', aylar: [3, 4, 7],
        zaman: 'Hava 18–20 °C olunca, mart sonu–nisan başında kışlaktan çıkar; meyvede beslenme temmuzda.',
        izleme: '10 ocakta silkeleme, 3×3,5 m bez.', esik: 'Ocak başına ortalama 1 veya daha fazla kışlamış ergin.', kaynak: 'findikGKGM', sayfa: '24–25' },
      { id: 'teke-bocegi', ad: 'Fındık teke böceği', latince: 'Oberea linearis', tur: 'zararli', aylar: [5, 6, 7],
        zaman: 'Erginler mayıs–haziranda; temmuz ortasında 10 ocakta sürgün kontrolü.', esik: 'Ocak başına ortalama 5’ten fazla zarar görmüş sürgün.', kaynak: 'findikGKGM', sayfa: '26' },
      { id: 'abd-beyaz-kelebek', ad: 'Amerikan beyaz kelebeği', latince: 'Hyphantria cunea', tur: 'zararli', aylar: [5, 7],
        zaman: '1. döl uçuşu mayısın 1–3. haftası, 2. döl temmuzun 3. haftası; temmuz ortasından yaprak dökümüne kadar ağ toplama.',
        esik: '10 ocakta ocak başına yaklaşık 5 bulaşık sürgün.', kaynak: 'findikGKGM', sayfa: '26–29' },
      { id: 'filiz-guvesi', ad: 'Fındık filiz güvesi', latince: 'Gypsonoma dealbana', tur: 'zararli', aylar: [5],
        zaman: 'Erginler mayıs sonunda görülür, yaklaşık 6 hafta uçar.', izleme: '10 ocakta alt-orta-üstten 30 yaprak.', esik: '100 yaprakta 15 beslenme belirtisi.', kaynak: 'findikGKGM', sayfa: '29–30' },
      { id: 'findik-virgul', ad: 'Virgül kabuklubiti', latince: 'Lepidosaphes ulmi', tur: 'zararli', aylar: [2, 3, 5],
        zaman: 'Şubat–martta 10 cm dalda canlı yumurta sayımı; yumurtalar mayıs başında açılır, larva kararı çıkışın %70–80’inde.',
        esik: '10 cm dalda ortalama 5 canlı yumurta.', kaynak: 'findikGKGM', sayfa: '30–31' },
      { id: 'galsinegi', ad: 'Fındık galsineği', latince: 'Mykomyia coryli', tur: 'zararli', aylar: [3, 4, 5],
        zaman: 'Mayısta sayım; koruyucu olduğu için karar bir yıl önceden verilir.', esik: '%50 bulaşma (püskülde tek gal bile bulaşık sayılır).', kaynak: 'findikGKGM', sayfa: '31–32' },
      { id: 'yaprakdeleni', ad: 'Fındık yaprakdeleni', latince: 'Anoplus roboris', tur: 'zararli', aylar: [3],
        zaman: 'Mart sonlarında; gerekirse 15 gün sonra yeniden sayım.', esik: 'Ocak başına 5 ergin veya 100 darbede 50 ergin.', kaynak: 'findikGKGM', sayfa: '32–34' },
      { id: 'bakteriyel-yaniklik', ad: 'Bakteriyel yanıklık', latince: 'Xanthomonas arboricola pv. corylina', tur: 'hastalik', mevsim: ['sonbahar', 'ilkbahar'],
        zaman: 'Hasattan sonra sonbahar yağışlarından önce; yaprakların %75’i döküldüğünde; ilkbaharda yaprak tomurcukları patlarken.', kaynak: 'findikGKGM', sayfa: '12–13' },
      { id: 'findik-kulleme', ad: 'Külleme', latince: 'Phyllactinia guttata', tur: 'hastalik',
        zaman: 'Önceki yıl görüldüyse sürgünler 25–30 cm iken belirti beklenmeden; yeni ise belirtiler görülür görülmez.', kaynak: 'findikGKGM', sayfa: '14' },
    ],
  },
  {
    key: 'misir', ad: 'Mısır', urunler: ['Mısır', 'Şeker Mısırı'], kapsam: 'genis',
    girdiler: [
      { id: 'kocankurdu', ad: 'Mısır koçankurdu', latince: 'Sesamia nonagrioides, S. cretica', tur: 'zararli', aylar: [3],
        zaman: 'Uçuş mart sonundan itibaren; bitki boyu 40–50 cm iken ilk yumurtalarla karar. Tarla haftada en az iki kez gezilir.',
        izleme: 'Işık tuzağı (haftada 5–10 kelebek eşiği).', esik: 'Birinci üründe bulaşık bitki %5 ve üzeri.', kaynak: 'misirGKGM', sayfa: '17–20',
        not: 'Şeker mısırı, taze tüketim ve silajlıkta ilaçlama yapılmaz.' },
      { id: 'misirkurdu', ad: 'Mısırkurdu', latince: 'Ostrinia nubilalis', tur: 'zararli', aylar: [4, 5],
        zaman: 'Kültürel önlemler hasattan mayısa kadar; kelebek çıkışından (nisan–mayıs) önce.', izleme: 'Işık tuzağı.', esik: 'Bulaşık bitki %5 ve üzeri.', kaynak: 'misirGKGM', sayfa: '20–23' },
      { id: 'misir-maymuncugu', ad: 'Mısır maymuncuğu', latince: 'Tanymecus dilaticollis', tur: 'zararli', aylar: [3, 4, 5, 6],
        zaman: 'Erginler mart başından; yumurtlama nisan başı–temmuz başı, en yoğun mayısın ikinci yarısı–haziranın ilk yarısı.', esik: 'Metrekarede ortalama 4 böcek.', kaynak: 'misirGKGM', sayfa: '24–25' },
      { id: 'misir-bozkurt', ad: 'Bozkurt', latince: 'Agrotis ipsilon, A. segetum', tur: 'zararli', aylar: [4],
        zaman: 'Erginler nisan başından; yılda 4–5 döl.', esik: '10 noktada 3 m sırada en az 2 yenik bitki.', kaynak: 'misirGKGM', sayfa: '26–29' },
      { id: 'cizgili-yaprakkurdu', ad: 'Çizgili yaprakkurdu', latince: 'Spodoptera exigua', tur: 'zararli', aylar: [4],
        zaman: 'Kışlayan erginler nisan sonlarına doğru; 2–4 ve 4–6 yapraklı dönemde 25 bitki sayılır.', esik: 'Bitki başına ortalama 2 larva.', kaynak: 'misirGKGM', sayfa: '30–31' },
      { id: 'danaburnu', ad: 'Danaburnu', latince: 'Gryllotalpa gryllotalpa', tur: 'zararli', aylar: [5, 6],
        zaman: 'Mayıs veya haziranda yumurtlar.', esik: '3 m sırada 3–4 kesik bitki.', kaynak: 'misirGKGM', sayfa: '32' },
      { id: 'telkurtlari', ad: 'Tel kurtları', latince: 'Agriotes spp.', tur: 'zararli', aylar: [9, 10],
        zaman: 'Ekimden önce; toprak uygulaması eylül veya ekimde de yapılabilir.', izleme: '¼ m² çerçeve, en az 12 kez, 20 cm derinlik.', esik: 'Metrekarede 10 veya daha fazla larva.', kaynak: 'misirGKGM', sayfa: '37–38' },
      { id: 'misir-yesilkurt', ad: 'Yeşilkurt', latince: 'Helicoverpa armigera', tur: 'zararli',
        zaman: 'Koçan püskülü döneminden hemen önce veya bu dönemde; larvalar 1.–3. dönemi geçmeden.',
        izleme: 'Feromon veya ışık tuzağı; birkaç gecede toplam 10 kelebek olursa tarla kontrolü sıklaşır.', esik: '5 noktada 5 bitkide, bitki başına ortalama 1 adet 1.–3. dönem larva.', kaynak: 'misirGKGM', sayfa: '39–40' },
      { id: 'misir-yabanci-ot', ad: 'Yabancı otlar', tur: 'yabanciot',
        zaman: 'Kritik dönem ekimden itibaren ilk 2 ay; mısır 20–30 cm, geniş yapraklılar 3–5 yapraklı, dar yapraklılar 10–15 cm iken.', kaynak: 'misirGKGM', sayfa: '44–46' },
    ],
  },
  {
    key: 'pamuk', ad: 'Pamuk', urunler: ['Pamuk', 'Çukurova Pamuğu'], kapsam: 'kismi',
    girdiler: [
      { id: 'pamuk-genel', ad: 'Genel sürvey', tur: 'zararli',
        zaman: 'Örnekleme en az haftada bir; temel gelişme döneminde haftada iki. Eşikler temel gelişme ve koza oluşturma dönemleri için ayrı belirlenmiştir. Ege ve Güneydoğu’da iki noktalı kırmızıörümcek ve tütün thripsi ana zararlıdır.', kaynak: 'pamukEMTT' },
      { id: 'pamuk-thrips', ad: 'Tütün thripsi', latince: 'Thrips tabaci', tur: 'zararli',
        zaman: 'Erken dönemde önemli; fidelerin tüm yaprakları kontrol edilir. Doğal düşman yoğunsa uygulama yapılmaz.',
        esik: 'Fide 1–3 gerçek yapraklıyken yaprak başına 1 nimf veya ergin.', kaynak: 'tutunTripsiBKU' },
      { id: 'pamuk-yaprakpireleri', ad: 'Yaprakpireleri', latince: 'Empoasca decipiens, Asymmetrasca decedens', tur: 'zararli',
        zaman: 'Popülasyon birinci sulamadan sonra taraklanma devresiyle artar. Erken dönemde gerekmedikçe kimyasal mücadele yapılmaz.', kaynak: 'pamukEMTT' },
      { id: 'pamuk-yesilkurt', ad: 'Yeşilkurt', latince: 'Helicoverpa armigera', tur: 'zararli',
        zaman: 'Genellikle koza oluşturma döneminden itibaren sorun olur; zamanlama 1.–3. dönem larvalara göre yapılır.',
        esik: '3 m’lik sıra uzunluğunda ortalama 2 larva.', kaynak: 'pamukEMTT', not: 'Sıra uzunluğu: GAP-TEYAP örnekleme kılavuzu.' },
      { id: 'pembekurt', ad: 'Pembekurt', latince: 'Pectinophora gossypiella', tur: 'zararli',
        zaman: 'Koza oluşturma döneminden itibaren; çapraz yürünerek 100 koza toplanır, kesilip içinde larva aranır.', kaynak: 'pamukGapTeyap' },
    ],
  },
  {
    key: 'aycicegi', ad: 'Ayçiçeği', urunler: ['Ayçiçeği'], kapsam: 'kismi',
    girdiler: [
      { id: 'aycicegi-ana', ad: 'Ana sorunlar', tur: 'hastalik',
        zaman: 'Talimata göre en önemlileri bozkurt, yeşilkurt, ayçiçeği mildiyösü ve yabancı otlar; en önemli zararlı canavar otudur. Yağışlı yazlarda tabla çürüklükleri artar.',
        kaynak: 'aycicegiEMTT', not: 'Canavar otu ve tabla çürüklüğü: Trakya Tarımsal Araştırma Enstitüsü.' },
      { id: 'aycicegi-yabanci-ot', ad: 'Yabancı otlar', tur: 'yabanciot',
        zaman: 'Ayçiçeğinin zarar gördüğü dönem genellikle ekimden sonraki 1–1,5 ay; mücadele bu dönemde yapılır.', kaynak: 'yabanciOtTagem' },
      { id: 'aycicegi-guvesi', ad: 'Avrupa ayçiçeği güvesi', latince: 'Homoeosoma nebulellum', tur: 'zararli',
        zaman: 'Çiçeklenme başlayınca, hakim rüzgâr yönünde biri tarla kenarına biri merkeze 2 delta feromon tuzağı; haftalık sayım.', kaynak: 'endustriZararliTagem' },
      { id: 'aycicegi-bozkurt', ad: 'Bozkurtlar', latince: 'Agrotis spp.', tur: 'zararli',
        zaman: 'Çıkıştan sonra 2–4 yapraklı dönemde; sabah çiğ kalktıktan sonra veya akşamüzeri köşegenler boyunca sayım.', kaynak: 'endustriZararliTagem' },
      { id: 'aycicegi-yesilkurt', ad: 'Yeşilkurt', latince: 'Helicoverpa armigera', tur: 'zararli', aylar: [4, 5],
        zaman: 'Kışı toprakta pupa olarak geçirir; kelebekler nisan sonu veya mayıs başından itibaren görülür.', kaynak: 'endustriZararliTagem' },
    ],
  },
];

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
