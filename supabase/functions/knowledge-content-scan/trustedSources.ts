/** Editorially selected source entry points. They are search CANDIDATES, not verified article claims.
 * Before generating a card, the engine must fetch and read the actual page/PDF text.
 * Tags are curated search terms, not facts extracted from the source.
 */
export const TRUSTED_GUIDE_SEEDS: Array<{title:string;url:string;keywords:string}> = [
  {
    "title": "Toprak Örneği Alma ve Analiz",
    "url": "https://arastirma.tarimorman.gov.tr/tokatarastirma/Sayfalar/Detay.aspx?TermId=7f477a6a-a8ea-4497-9ddb-173030b5be42&UrlSuffix=27",
    "keywords": "toprak numune örnek örnekleme analiz laboratuvar gübre besin"
  },
  {
    "title": "Toprak Analiz Laboratuvarı",
    "url": "https://arastirma.tarimorman.gov.tr/alata/Menu/38/Toprak-Analiz-Laboratuvari",
    "keywords": "toprak analiz gübre gübreleme azot fosfor potasyum eksiklik besin"
  },
  {
    "title": "Buğday Tarımı — TAGEM",
    "url": "https://arastirma.tarimorman.gov.tr/ttae/Sayfalar/Detay.aspx?SayfaId=46",
    "keywords": "buğday hububat tahıl ekim ekim zamanı tohum tohumluk gübre azot sulama pas yabancı ot hasat münavebe"
  },
  {
    "title": "Damla Sulama Yöntemi — TAGEM",
    "url": "https://arastirma.tarimorman.gov.tr/yalovabahce/Belgeler/brosurler/DamlaSulamaYontemi.pdf",
    "keywords": "damla sulama filtre boru damlatıcı tıkanma tıkanıklık basınç su verim"
  },
  {
    "title": "Tansiyometre ile Toprak Nemi ve Sulama",
    "url": "https://arastirma.tarimorman.gov.tr/toprakgubre/Belgeler/tansiyometre.pdf",
    "keywords": "tansiyometre toprak nem sulama su kuraklık sensör sulama zamanı"
  },
  {
    "title": "Hububatta Soğuk ve Don Zararı",
    "url": "https://arastirma.tarimorman.gov.tr/zmmae/Belgeler/Kutu%20Men%C3%BC/%C3%A7ift%C3%A7i%20b%C3%BClteni/Hububatta%20so%C4%9Fuk%20ve%20don%20zarar%C4%B1.pdf",
    "keywords": "don soğuk kırağı buz hububat buğday arpa don zararı sıcaklık iklim"
  },
  {
    "title": "Sebzelerde Çökerten Hastalığı — Zirai Mücadele",
    "url": "https://arastirma.tarimorman.gov.tr/zmmae/Belgeler/Sol%20Menu/Zirai%20M%C3%BCcadele%20Rehberi/Sebze/Hastal%C4%B1k/44.pdf",
    "keywords": "fide çökerten kök boğazı çürüklük sebze hastalık mantar domates biber patlıcan fidan"
  },
  {
    "title": "Kanola Tarımı ve Yabancı Ot Yönetimi",
    "url": "https://arastirma.tarimorman.gov.tr/ttae/Sayfalar/Detay.aspx?SayfaId=80",
    "keywords": "kanola kolza yabancı ot herbisit ekim bakım rotasyon münavebe"
  },
  {
    "title": "Aspir Bitkisi ve Tarımı",
    "url": "https://arastirma.tarimorman.gov.tr/ttae/Sayfalar/Detay.aspx?SayfaId=59",
    "keywords": "aspir tohum ekim derinlik kurak tarım yağış yetiştirme"
  },
  {
    "title": "Organik Tarım ve Ekim Nöbeti",
    "url": "https://arastirma.tarimorman.gov.tr/ttae/sayfalar/detay.aspx?sayfaid=66",
    "keywords": "organik tarım ekim nöbeti münavebe rotasyon toprak sürdürülebilir"
  },
  {
    "title": "Kolza Tarımı ve Gübreleme",
    "url": "https://arastirma.tarimorman.gov.tr/ktae/Belgeler/kolza_kitap_2021.pdf",
    "keywords": "kolza kanola gübre azot bitki besleme verim ekim"
  },
  {
    "title": "Sebzelerde Gübreleme",
    "url": "https://arastirma.tarimorman.gov.tr/alata/Belgeler/brosurler/brosur2022/SebzelerdeG%C3%BCbreleme-RasimARSLAN.pdf",
    "keywords": "sebze gübre gübreleme azot fosfor potasyum besin eksikliği sulama domates biber patlıcan"
  },
  {
    "title": "Derim Sonrası Kayıpların Azaltılması",
    "url": "https://arastirma.tarimorman.gov.tr/alata/Belgeler/brosurler/brosur2022/DerimSonras%C4%B1Kay%C4%B1plar-ZaferKARA%C5%9EAH%C4%B0N.pdf",
    "keywords": "hasat depolama ürün kayıp kalite soğuk zincir meyve sebze raf ömrü"
  },
  {
    "title": "Nohut Tarımı ve Tohumluk Kalitesi",
    "url": "https://arastirma.tarimorman.gov.tr/gktaem/Belgeler/B%C3%BClten/2023%20B%C3%BClten%20Say%C4%B1_1.pdf",
    "keywords": "nohut tohum tohumluk sertifikalı kalite ekim çıkış hastalık"
  },
  {
    "title": "Kirazda Entegre Mücadele",
    "url": "https://arastirma.tarimorman.gov.tr/bzmai/Belgeler/Yay%C4%B1nlar/kiraz.pdf",
    "keywords": "kiraz meyve sineği böcek zararlı hastalık ilaç entegre mücadele tuzak izleme"
  },
  {
    "title": "Sulama Suyunda Tuzluluk",
    "url": "https://arastirma.tarimorman.gov.tr/bursagida/Belgeler/e-B%C3%BClten/2022%20SAYI%2056.pdf",
    "keywords": "su sulama tuzluluk tuz elektiriksel iletkenlik ec sodiklik toprak"
  },
  {
    "title": "Oklahoma Soil Fertility Handbook",
    "url": "https://extension.okstate.edu/fact-sheets/oklahoma-soil-fertility-handbook-full",
    "keywords": "soil fertility nitrogen nutrient chlorosis deficiency gübre azot besin bitki yaprak sararma toprak analiz"
  },
  {
    "title": "Effects of Soil Compaction — Penn State Extension",
    "url": "https://extension.psu.edu/effects-of-soil-compaction",
    "keywords": "soil compaction wheel traffic machinery toprak sıkışma sıkışması ıslak yağış traktör makine"
  },
  {
    "title": "Uzaktan Algılama, Yapay Zekâ ve Akıllı Tarım",
    "url": "https://dergipark.org.tr/tr/pub/ejosat/article/1335541",
    "keywords": "azot haritası azot stresi uydu uzaktan algılama ndre ndvi drone iha multispektral hassas tarım teknoloji gübre toprak besin"
  },
  {
    "title": "Tarla Bitkilerinde Akıllı Tarım Teknolojileri",
    "url": "https://dergipark.org.tr/tr/pub/tutad/article/1730333",
    "keywords": "uydu ndvi ndre azot haritası harita drone hassas tarım tarla bitkileri yapay zeka uzaktan algılama"
  },
  {
    "title": "Bahçe Bitkilerinde Dijital Tarım Teknolojileri",
    "url": "https://dergipark.org.tr/tr/pub/tarmak/article/1244072",
    "keywords": "bahçe tarım teknoloji hassas sulama gübre drone iha uydu ndvi su stresi"
  },
  {
    "title": "İHA ve Tarımsal Uygulamalar",
    "url": "https://dergipark.org.tr/tr/pub/tiha/article/707831",
    "keywords": "drone iha uydu uzaktan algılama hassas tarım harita azot stresi"
  },
  {
    "title": "Bitki Hastalıklarının Erken Teşhisinde Vis-NIR",
    "url": "https://dergipark.org.tr/tr/pub/yyufbed/article/1626624",
    "keywords": "bitki hastalık yaprak leke erken teşhis spektroskopi drone uzaktan algılama"
  },
  {
    "title": "Bitki Mineral Beslenmesi ve Gübreleme",
    "url": "https://dergipark.org.tr/tr/pub/ajfr/article/1945633",
    "keywords": "azot fosfor potasyum besin gübre gübreleme beslenme eksiklik yaprak mineral"
  }
];
