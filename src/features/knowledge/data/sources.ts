import type { KnowledgeSource } from '../types.ts';

export const knowledgeSources: KnowledgeSource[] = [
  {
    id: 'openfarm', name: 'OpenFarm', url: 'https://github.com/openfarmcc/OpenFarm',
    description: 'Bitki yetiştirme ve bakım rehberleri.', status: 'Arşiv kaynağı',
    limitation: 'Hizmet Nisan 2025’te kapandı. Canlı içerik alınmıyor; erişilebilir veri arşivi gerekli.',
    license: 'Veri: CC0; yazılım: MIT', checkedAt: '2026-09-16',
  },
  {
    id: 'pdo', name: 'Plant Disease Ontology', url: 'https://github.com/Planteome/plant-disease-ontology',
    description: 'Bitki hastalıklarının adlarını ve aralarındaki ilişkileri düzenleyen sözlük.',
    status: 'Ön çalışma', limitation: 'Kaynak ön çalışma olarak işaretli ve Plant Stress Ontology’ye taşınıyor. İçerik lisansı ve terimler doğrulanmadan aktarılmadı.',
    license: 'İçerik kullanım koşulları doğrulanmalı', checkedAt: '2026-09-16',
  },
  {
    id: 'agrodss', name: 'AgrODSS / PDP-O', url: 'https://github.com/Amalharbi/AgrODSS',
    description: 'Hastalık, zararlı ve mücadele kavramlarını ilişkilendiren araştırma projesi.',
    status: 'Kaynak bağlantısı', limitation: 'Depoda araştırma belgeleri var. Kullanılabilir ontoloji dosyası ve yeniden kullanım izni henüz doğrulanmadı.',
    license: 'İçerik kullanım koşulları doğrulanmalı', checkedAt: '2026-09-16',
  },
  {
    id: 'agripest', name: 'AgriPestDatabase', url: 'https://github.com/SHAFNehal/AgriPestDatabase_USDA_TextDataBase_for_LLM_Training',
    description: 'USDA belgelerinden derlenen zararlı bilgi metinleri; bağımsız araştırma veri seti.',
    status: 'Taslak kaynak', limitation: 'Resmî USDA API’si değildir. Kaynak kendi içeriğini taslak olarak işaretliyor; tam metinler aktarılmadı.',
    license: 'Belge bazında kullanım koşulları doğrulanmalı', checkedAt: '2026-09-16',
  },
  {
    id: 'plantvillage', name: 'PlantVillage', url: 'https://github.com/spMohanty/PlantVillage-Dataset',
    description: 'Bitki yaprakları için hastalık ve sağlıklı örnek sınıfları.',
    status: 'Türkçe etiket kataloğu', limitation: 'Yalnızca sınıf adları Türkçeleştirildi. Fotoğraf arşivi, teşhis modeli veya mücadele rehberi değildir.',
    license: 'CC BY-SA 3.0 (veri kartı)', checkedAt: '2026-09-16',
  },
  {
    id: 'ip102', name: 'IP102', url: 'https://github.com/xpwu95/IP102',
    description: 'Böcek zararlıları için görüntü tanıma araştırma veri seti.',
    status: 'Kullanım izni gerekiyor', limitation: 'Ücretsiz kullanım akademik amaçlarla sınırlı. Uygulamada dağıtım için hak sahibinin izni gerekli; görüntüler aktarılmadı.',
    license: 'Akademik kullanım; diğer amaçlar için izin', checkedAt: '2026-09-16',
  },
];

/**
 * TarlaPusula ortak içerik kaynak kataloğu.
 *
 * ÖNEMLİ:
 * - Burada bir kaynağın bulunması, içeriğinin otomatik kopyalanacağı anlamına gelmez.
 * - "api" ve "rss" yalnız gerçekten desteklenen bağlantı kurulduğunda otomatik çekim içindir.
 * - "web" kaynak keşfi/metadata çıkarımı içindir; robots.txt, kullanım koşulları ve lisans korunur.
 * - "manual" yalnız referans/manuel editoryal inceleme içindir.
 * - Aday içerik her zaman normalize -> tekilleştir -> kaynak kontrolü -> AI taslak ->
 *   admin onayı -> yayın akışından geçer.
 */

export type ContentSourceLanguage = 'tr' | 'en';
export type ContentSourceRegion = 'TR' | 'GLOBAL';
export type ContentSourceKind = 'article' | 'news' | 'guide';
export type ContentSourceIngestion = 'api' | 'rss' | 'web' | 'manual';
export type ContentSourceAuthority =
  | 'peer_reviewed'
  | 'academic_index'
  | 'extension'
  | 'technical'
  | 'news_agency'
  | 'sector_media'
  | 'general_media'
  | 'community';

export type KnowledgeGuideCategory =
  | 'growing'
  | 'disease'
  | 'pest'
  | 'weed'
  | 'nutrition'
  | 'irrigation'
  | 'fertilization'
  | 'soil'
  | 'harvest_storage';

export interface ContentCatalogSource {
  id: string;
  name: string;
  url: string;
  kind: ContentSourceKind;
  language: ContentSourceLanguage;
  region: ContentSourceRegion;
  authority: ContentSourceAuthority;
  ingestion: ContentSourceIngestion;
  priority: 'high' | 'normal' | 'low';
  enabled: boolean;
  categories?: KnowledgeGuideCategory[];
  note: string;
}

const source = (
  id: string,
  name: string,
  url: string,
  kind: ContentSourceKind,
  language: ContentSourceLanguage,
  region: ContentSourceRegion,
  authority: ContentSourceAuthority,
  ingestion: ContentSourceIngestion,
  priority: 'high' | 'normal' | 'low',
  note: string,
  categories?: KnowledgeGuideCategory[],
): ContentCatalogSource => ({
  id, name, url, kind, language, region, authority, ingestion, priority,
  enabled: true, note, ...(categories ? { categories } : {}),
});

const ALL_GUIDE: KnowledgeGuideCategory[] = [
  'growing', 'disease', 'pest', 'weed', 'nutrition',
  'irrigation', 'fertilization', 'soil', 'harvest_storage',
];

const IPM_GUIDE: KnowledgeGuideCategory[] = ['disease', 'pest', 'weed', 'growing'];
const CROP_GUIDE: KnowledgeGuideCategory[] = [
  'growing', 'nutrition', 'irrigation', 'fertilization', 'soil', 'harvest_storage',
];

/* -------------------------------------------------------------------------- */
/* 1) TÜRKÇE MAKALE / AKADEMİK                                                */
/* -------------------------------------------------------------------------- */

export const turkishArticleSources: ContentCatalogSource[] = [
  source('dergipark', 'DergiPark', 'https://dergipark.org.tr/', 'article', 'tr', 'TR', 'academic_index', 'web', 'high',
    'Tarım ve ziraat dergilerinin ana keşif havuzu. Üreticiye uygulanabilirlik puanı ile sıralanır.'),
  source('tutad', 'Türkiye Tarımsal Araştırmalar Dergisi', 'https://dergipark.org.tr/tr/pub/tutad', 'article', 'tr', 'TR', 'peer_reviewed', 'web', 'high',
    'Tarla bitkileri, bitki koruma, sulama, toprak, bitki besleme ve tarım ekonomisi.'),
  source('mkutbd', 'Mustafa Kemal Üniversitesi Tarım Bilimleri Dergisi', 'https://dergipark.org.tr/tr/pub/mkutbd', 'article', 'tr', 'TR', 'peer_reviewed', 'web', 'high',
    'Bitki koruma, yetiştiricilik, sulama, toprak ve bitki besleme için güçlü Türkiye kaynağı.'),
  source('omuanajas', 'Anadolu Tarım Bilimleri Dergisi', 'https://dergipark.org.tr/tr/pub/omuanajas', 'article', 'tr', 'TR', 'peer_reviewed', 'web', 'high',
    'Temel ve uygulamalı tarım araştırmaları.'),
  source('ataunizfd', 'Atatürk Üniversitesi Ziraat Fakültesi Dergisi', 'https://dergipark.org.tr/tr/pub/ataunizfd', 'article', 'tr', 'TR', 'peer_reviewed', 'web', 'normal',
    'Araştırma, derleme ve teknik notlar.'),
  source('cutarim', 'Çukurova Tarım ve Gıda Bilimleri Dergisi', 'https://dergipark.org.tr/tr/pub/cutarim', 'article', 'tr', 'TR', 'peer_reviewed', 'web', 'high',
    'Akdeniz ve Çukurova üretim koşulları için bölgesel olarak değerli.'),
  source('harranziraat', 'Harran Tarım ve Gıda Bilimleri Dergisi', 'https://dergipark.org.tr/tr/pub/harranziraat', 'article', 'tr', 'TR', 'peer_reviewed', 'web', 'high',
    'Kuraklık, sulama, sıcaklık, bitki koruma ve Güneydoğu üretim koşulları.'),
  source('ege-ziraat', 'Ege Üniversitesi Ziraat Fakültesi Dergisi', 'https://dergipark.org.tr/tr/pub/zfdergi', 'article', 'tr', 'TR', 'peer_reviewed', 'web', 'normal',
    'Ege ve Akdeniz tarımı için güçlü akademik kaynak; yabancı dil içerikler Türkçe özetlenebilir.'),
  source('tarim-ekonomisi', 'Tarım Ekonomisi Dergisi', 'https://dergipark.org.tr/tr/pub/tarekoder', 'article', 'tr', 'TR', 'peer_reviewed', 'web', 'normal',
    'Üretim ekonomisi, pazarlama, tarım politikası ve işletme yönetimi.'),
  source('bojans', 'Bozok Tarım ve Doğa Bilimleri Dergisi', 'https://dergipark.org.tr/tr/pub/bojans', 'article', 'tr', 'TR', 'peer_reviewed', 'web', 'normal',
    'Tarım ve doğa bilimleri için ek Türkiye akademik kaynağı.'),
];

/* -------------------------------------------------------------------------- */
/* 2) YABANCI MAKALE / AKADEMİK                                               */
/* -------------------------------------------------------------------------- */

export const internationalArticleSources: ContentCatalogSource[] = [
  source('crossref', 'Crossref', 'https://www.crossref.org/', 'article', 'en', 'GLOBAL', 'academic_index', 'api', 'high',
    'DOI ve yayın metadata keşfi; başlık/DOI tekilleştirmede ana kaynaklardan biri.'),
  source('openalex', 'OpenAlex', 'https://openalex.org/', 'article', 'en', 'GLOBAL', 'academic_index', 'api', 'high',
    'Akademik yayın, kurum, konu ve atıf keşfi.'),
  source('semantic-scholar', 'Semantic Scholar', 'https://www.semanticscholar.org/', 'article', 'en', 'GLOBAL', 'academic_index', 'api', 'high',
    'Tarım ve bitki bilimi yayın keşfi; üreticiye uygulanabilir içerikler öne çıkarılır.'),
  source('agris', 'FAO AGRIS', 'https://agris.fao.org/', 'article', 'en', 'GLOBAL', 'academic_index', 'web', 'high',
    'Tarım ve gıda alanına özel uluslararası literatür havuzu.'),
  source('agricola', 'AGRICOLA', 'https://agricola.nal.usda.gov/', 'article', 'en', 'GLOBAL', 'academic_index', 'web', 'high',
    'USDA National Agricultural Library tarım literatürü.'),
  source('doaj', 'DOAJ', 'https://doaj.org/', 'article', 'en', 'GLOBAL', 'academic_index', 'api', 'normal',
    'Açık erişimli hakemli dergilerin keşfi.'),
  source('pubmed', 'PubMed', 'https://pubmed.ncbi.nlm.nih.gov/', 'article', 'en', 'GLOBAL', 'academic_index', 'api', 'normal',
    'Bitki patolojisi, mikrobiyoloji ve gıda/sağlık kesişimindeki yayınlar için tamamlayıcı kaynak.'),
  source('frontiers-plant-science', 'Frontiers in Plant Science', 'https://www.frontiersin.org/journals/plant-science', 'article', 'en', 'GLOBAL', 'peer_reviewed', 'web', 'normal',
    'Bitki fizyolojisi, hastalık, stres ve yetiştiricilik araştırmaları.'),
  source('field-crops-research', 'Field Crops Research', 'https://www.sciencedirect.com/journal/field-crops-research', 'article', 'en', 'GLOBAL', 'peer_reviewed', 'manual', 'high',
    'Tarla bitkileri, verim, agronomi ve yönetim araştırmaları; metadata/referans amaçlı.'),
  source('ag-water-management', 'Agricultural Water Management', 'https://www.sciencedirect.com/journal/agricultural-water-management', 'article', 'en', 'GLOBAL', 'peer_reviewed', 'manual', 'high',
    'Sulama, su verimliliği ve tarımsal su yönetimi.'),
  source('crop-protection', 'Crop Protection', 'https://www.sciencedirect.com/journal/crop-protection', 'article', 'en', 'GLOBAL', 'peer_reviewed', 'manual', 'high',
    'Hastalık, zararlı, yabancı ot ve entegre mücadele araştırmaları.'),
  source('computers-agriculture', 'Computers and Electronics in Agriculture', 'https://www.sciencedirect.com/journal/computers-and-electronics-in-agriculture', 'article', 'en', 'GLOBAL', 'peer_reviewed', 'manual', 'normal',
    'Dijital tarım, sensör, görüntüleme ve karar destek; saf teknik çalışmalar düşük öncelik alır.'),
  source('precision-agriculture-journal', 'Precision Agriculture', 'https://link.springer.com/journal/11119', 'article', 'en', 'GLOBAL', 'peer_reviewed', 'manual', 'normal',
    'Hassas tarım ve saha karar destek araştırmaları.'),
  source('plant-disease-journal', 'Plant Disease', 'https://apsjournals.apsnet.org/journal/pdis', 'article', 'en', 'GLOBAL', 'peer_reviewed', 'manual', 'high',
    'Bitki hastalıkları ve epidemiyoloji için güçlü bilimsel kaynak.'),
  source('agronomy-mdpi', 'Agronomy', 'https://www.mdpi.com/journal/agronomy', 'article', 'en', 'GLOBAL', 'peer_reviewed', 'web', 'normal',
    'Agronomi, bitki besleme, toprak, sulama ve üretim sistemleri.'),
];

/* -------------------------------------------------------------------------- */
/* 3) TÜRKÇE HABER                                                            */
/* -------------------------------------------------------------------------- */

export const turkishNewsSources: ContentCatalogSource[] = [
  source('tarimdan-haber', 'Tarımdan Haber', 'https://www.tarimdanhaber.com/', 'news', 'tr', 'TR', 'sector_media', 'web', 'high',
    'Tarım, hayvancılık, girdi, destek, fiyat ve üretici gündemi.'),
  source('tarim-pusulasi', 'Tarım Pusulası', 'https://www.tarimpusulasi.com/', 'news', 'tr', 'TR', 'sector_media', 'web', 'normal',
    'Sektörel tarım haberleri; özgünlük ve kaynak kontrolü sonrası adaylaştırılır.'),
  source('tarim-turk', 'Tarım Türk', 'https://www.tarimturk.com.tr/', 'news', 'tr', 'TR', 'sector_media', 'web', 'normal',
    'Tarım sektör haberleri; kaynak doğrulaması zorunlu.'),
  source('tarim-dunyasi', 'Tarım Dünyası', 'https://www.tarimdunyasi.net/', 'news', 'tr', 'TR', 'sector_media', 'web', 'normal',
    'Tarım ekonomisi ve sektör gelişmeleri; tekrar haberler tekilleştirilir.'),
  source('ciftci-tv', 'Çiftçi TV', 'https://www.ciftcitv.com/', 'news', 'tr', 'TR', 'sector_media', 'web', 'normal',
    'Üretici ve saha odaklı tarım gündemi.'),
  source('agro-tv', 'Agro TV', 'https://www.agrotv.com.tr/', 'news', 'tr', 'TR', 'sector_media', 'web', 'normal',
    'Tarım ve gıda sektör gündemi; editoryal doğrulama sonrası kullanılır.'),
  source('ekonomim-tarim', 'Ekonomim · Tarım/Gıda', 'https://www.ekonomim.com/', 'news', 'tr', 'TR', 'general_media', 'web', 'normal',
    'Piyasa, emtia, tarım ekonomisi ve gıda sanayisi haberleri.'),
  source('dunya-tarim', 'Dünya · Tarım/Emtia', 'https://www.dunya.com/', 'news', 'tr', 'TR', 'general_media', 'web', 'normal',
    'Tarım ekonomisi, emtia ve piyasa gelişmeleri.'),
  source('aa-tarim', 'Anadolu Ajansı · Tarım', 'https://www.aa.com.tr/tr/ekonomi', 'news', 'tr', 'TR', 'news_agency', 'web', 'normal',
    'Ulusal ve yerel üretim/hasat/piyasa haberleri; aynı olay diğer kaynaklarla tekilleştirilir.'),
  source('dha-tarim', 'DHA · Tarım', 'https://www.dha.com.tr/haberleri/tarim', 'news', 'tr', 'TR', 'news_agency', 'web', 'normal',
    'Yerel üretim, hasat ve saha haberleri için tamamlayıcı kaynak.'),
  source('iha-tarim', 'İHA · Tarım', 'https://www.iha.com.tr/', 'news', 'tr', 'TR', 'news_agency', 'web', 'normal',
    'Yerel tarım olayları ve saha haberleri; doğrulama/tekilleştirme uygulanır.'),
];

/* -------------------------------------------------------------------------- */
/* 4) YABANCI HABER                                                           */
/* -------------------------------------------------------------------------- */

export const internationalNewsSources: ContentCatalogSource[] = [
  source('reuters-agriculture', 'Reuters · Agriculture/Commodities', 'https://www.reuters.com/markets/commodities/', 'news', 'en', 'GLOBAL', 'news_agency', 'web', 'high',
    'Küresel emtia, üretim, ticaret ve tarımsal piyasa gelişmeleri.'),
  source('agweb', 'AgWeb', 'https://www.agweb.com/', 'news', 'en', 'GLOBAL', 'sector_media', 'web', 'normal',
    'ABD tarımı, ürün piyasaları, hava ve üretici gündemi.'),
  source('successful-farming', 'Successful Farming', 'https://www.agriculture.com/', 'news', 'en', 'GLOBAL', 'sector_media', 'web', 'normal',
    'Üretim, hava, ekipman, piyasa ve çiftçi odaklı içerikler.'),
  source('farm-progress', 'Farm Progress', 'https://www.farmprogress.com/', 'news', 'en', 'GLOBAL', 'sector_media', 'web', 'normal',
    'Ürün yönetimi, saha haberleri ve tarım piyasaları.'),
  source('farmers-weekly', 'Farmers Weekly', 'https://www.fwi.co.uk/', 'news', 'en', 'GLOBAL', 'sector_media', 'web', 'high',
    'Birleşik Krallık ve Avrupa tarımı, yetiştiricilik, hastalık ve piyasa gündemi.'),
  source('agriland', 'Agriland', 'https://www.agriland.ie/', 'news', 'en', 'GLOBAL', 'sector_media', 'web', 'normal',
    'İrlanda/Avrupa tarımı ve sektör gelişmeleri.'),
  source('freshplaza', 'FreshPlaza', 'https://www.freshplaza.com/', 'news', 'en', 'GLOBAL', 'sector_media', 'web', 'normal',
    'Meyve-sebze üretimi, ticareti, hasat ve küresel tedarik zinciri.'),
  source('hortidaily', 'HortiDaily', 'https://www.hortidaily.com/', 'news', 'en', 'GLOBAL', 'sector_media', 'web', 'normal',
    'Seracılık, bahçe bitkileri ve kontrollü üretim teknolojileri.'),
  source('agfundernews', 'AgFunderNews', 'https://agfundernews.com/', 'news', 'en', 'GLOBAL', 'sector_media', 'web', 'low',
    'Agtech ve gıda teknolojisi; doğrudan üretici faydası düşük içerikler aşağı sıralanır.'),
  source('future-farming', 'Future Farming', 'https://www.futurefarming.com/', 'news', 'en', 'GLOBAL', 'sector_media', 'web', 'normal',
    'Hassas tarım, robotik, sensör ve saha teknolojileri.'),
  source('world-grain', 'World Grain', 'https://www.world-grain.com/', 'news', 'en', 'GLOBAL', 'sector_media', 'web', 'high',
    'Hububat, tahıl ticareti, üretim ve işleme piyasaları.'),
  source('fruitnet', 'Fruitnet', 'https://www.fruitnet.com/', 'news', 'en', 'GLOBAL', 'sector_media', 'web', 'normal',
    'Meyve-sebze üretimi, ticaret ve pazar gelişmeleri.'),
  source('the-packer', 'The Packer', 'https://www.thepacker.com/', 'news', 'en', 'GLOBAL', 'sector_media', 'web', 'normal',
    'Taze ürün pazarı ve üretim/ticaret gündemi.'),
  source('agri-pulse', 'Agri-Pulse', 'https://www.agri-pulse.com/', 'news', 'en', 'GLOBAL', 'sector_media', 'manual', 'normal',
    'Tarım politikası ve sektör gündemi; erişim koşulları nedeniyle manuel/referans kaynak.'),
];

/* -------------------------------------------------------------------------- */
/* 5) BİLGİ REHBERİ — TÜRKÇE + YABANCI                                       */
/* -------------------------------------------------------------------------- */

export const knowledgeGuideSources: ContentCatalogSource[] = [
  source('guide-dergipark', 'DergiPark · Uygulamalı Tarım Yayınları', 'https://dergipark.org.tr/', 'guide', 'tr', 'TR', 'academic_index', 'web', 'high',
    'Yalnız üreticiye dönüştürülebilir teknik sonuçlar Bilgi Rehberi adayına çevrilir.', ALL_GUIDE),
  source('guide-ziraatfakultesi', 'ZiraatFakultesi.com.tr', 'https://www.ziraatfakultesi.com.tr/', 'guide', 'tr', 'TR', 'technical', 'web', 'normal',
    'Yetiştiricilik, hastalık, zararlı ve yabancı ot içerikleri güçlü kaynaklarla çapraz doğrulanır.', ALL_GUIDE),
  source('guide-tr-university', 'Türkiye Ziraat Fakülteleri · Teknik Yayınlar', 'https://www.yok.gov.tr/', 'guide', 'tr', 'TR', 'extension', 'manual', 'high',
    'Üniversite teknik föyleri, üretici eğitim notları ve yetiştiricilik rehberleri kurum bazında eklenir.', ALL_GUIDE),

  source('plantwiseplus', 'CABI PlantwisePlus Knowledge Bank', 'https://plantwiseplusknowledgebank.org/', 'guide', 'en', 'GLOBAL', 'technical', 'web', 'high',
    'Hastalık, zararlı, belirtiler ve IPM için ana uluslararası kaynaklardan biri; erişim/lisans koşulları korunur.', IPM_GUIDE),
  source('uc-ipm', 'UC Integrated Pest Management', 'https://ipm.ucanr.edu/agriculture/', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'high',
    'Ürün bazlı hastalık, zararlı, nematod ve yabancı ot yönetimi.', IPM_GUIDE),
  source('ahdb-ipm', 'AHDB Integrated Pest Management', 'https://ahdb.org.uk/IPM', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'high',
    'Özellikle tahıl, yağlı tohum ve patates için uygulamalı IPM bilgisi.', IPM_GUIDE),
  source('eppo', 'EPPO Global Database', 'https://gd.eppo.int/', 'guide', 'en', 'GLOBAL', 'technical', 'web', 'high',
    'Zararlı organizmalar, konukçular, dağılım ve fitosaniter bilgi için güçlü referans.', ['disease', 'pest', 'weed']),
  source('aps', 'American Phytopathological Society', 'https://www.apsnet.org/', 'guide', 'en', 'GLOBAL', 'technical', 'manual', 'high',
    'Bitki hastalıkları, tanı ve patoloji için uzman referans; kullanım koşulları gözetilir.', ['disease']),
  source('pennstate-extension', 'Penn State Extension', 'https://extension.psu.edu/', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'normal',
    'Üretici odaklı yetiştiricilik, hastalık, zararlı ve toprak içerikleri.', ALL_GUIDE),
  source('cornell-extension', 'Cornell Cooperative Extension / CALS', 'https://cals.cornell.edu/', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'normal',
    'Bitki sağlığı, yetiştiricilik ve IPM teknik içerikleri.', ALL_GUIDE),
  source('purdue-extension', 'Purdue Extension', 'https://extension.purdue.edu/', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'normal',
    'Tarla bitkileri, hastalık, zararlı, yabancı ot ve yetiştiricilik yayınları.', ALL_GUIDE),
  source('umn-extension', 'University of Minnesota Extension', 'https://extension.umn.edu/', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'normal',
    'Tarla bitkileri, hastalık, zararlı, toprak ve soğuk iklim üretim rehberleri.', ALL_GUIDE),
  source('iowa-extension', 'Iowa State University Extension', 'https://www.extension.iastate.edu/', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'normal',
    'Mısır, soya, toprak, besleme ve IPM için güçlü saha bilgisi.', ALL_GUIDE),
  source('msu-extension', 'Michigan State University Extension', 'https://www.canr.msu.edu/outreach/', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'normal',
    'Bahçe/tarla bitkileri, hastalık ve zararlı yönetimi.', ALL_GUIDE),
  source('ncsu-extension', 'NC State Extension', 'https://extension.ncsu.edu/', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'normal',
    'Ürün bazlı yetiştiricilik, hastalık ve zararlı rehberleri.', ALL_GUIDE),
  source('tamu-agrilife', 'Texas A&M AgriLife Extension', 'https://agrilifeextension.tamu.edu/', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'normal',
    'Sıcak/kurak koşullar, tarla yönetimi, sulama ve IPM için değerli.', ALL_GUIDE),
  source('uf-ifas', 'UF/IFAS Extension', 'https://extension.ifas.ufl.edu/', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'normal',
    'Bahçe ve tropik ürünler, sulama, besleme, hastalık ve zararlı rehberleri.', ALL_GUIDE),
  source('nebraska-cropwatch', 'Nebraska CropWatch', 'https://cropwatch.unl.edu/', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'normal',
    'Tarla bitkileri, sulama, kuraklık, hastalık ve saha yönetimi.', ALL_GUIDE),
  source('kstate-agronomy', 'Kansas State Agronomy / Extension', 'https://www.agronomy.k-state.edu/', 'guide', 'en', 'GLOBAL', 'extension', 'web', 'normal',
    'Kurak alan tarımı, toprak, besleme ve tarla bitkileri için güçlü kaynak.', CROP_GUIDE),
];

/* -------------------------------------------------------------------------- */
/* BİRLEŞİK KATALOG / FİLTRELER                                               */
/* -------------------------------------------------------------------------- */

export const contentSourceCatalog: ContentCatalogSource[] = [
  ...turkishArticleSources,
  ...internationalArticleSources,
  ...turkishNewsSources,
  ...internationalNewsSources,
  ...knowledgeGuideSources,
];

export const enabledContentSources = contentSourceCatalog.filter((item) => item.enabled);

export function getContentSources(filters?: {
  kind?: ContentSourceKind;
  language?: ContentSourceLanguage;
  category?: KnowledgeGuideCategory;
  ingestion?: ContentSourceIngestion;
}) {
  return enabledContentSources.filter((item) => {
    if (filters?.kind && item.kind !== filters.kind) return false;
    if (filters?.language && item.language !== filters.language) return false;
    if (filters?.ingestion && item.ingestion !== filters.ingestion) return false;
    if (filters?.category && !item.categories?.includes(filters.category)) return false;
    return true;
  });
}

export const enabledKnowledgeGuideSources = knowledgeGuideSources.filter((item) => item.enabled);

export function getKnowledgeGuideSources(filters?: {
  language?: ContentSourceLanguage;
  category?: KnowledgeGuideCategory;
}) {
  return enabledKnowledgeGuideSources.filter((item) => {
    if (filters?.language && item.language !== filters.language) return false;
    if (filters?.category && !item.categories?.includes(filters.category)) return false;
    return true;
  });
}
