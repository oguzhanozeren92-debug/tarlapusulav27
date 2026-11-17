/**
 * Zararlı/hastalık takviminin dayandığı resmî kaynaklar. Hepsi T.C. Tarım ve
 * Orman Bakanlığı (TAGEM, GKGM, BKÜ veri tabanı, araştırma enstitüleri,
 * il müdürlükleri) ya da GAP İdaresi yayınıdır. Takvimdeki her satır bu
 * listeden bir kaynağa ve varsa sayfa numarasına bağlanır.
 */
export type PestSource = { id: string; kurum: string; baslik: string; url: string };

export const PEST_SOURCES: Record<string, PestSource> = {
  zeytinEMTT: {
    id: 'zeytinEMTT', kurum: 'TAGEM',
    baslik: 'Zeytin Entegre Mücadele Teknik Talimatı (2022)',
    url: 'https://www.tarimorman.gov.tr/TAGEM/Belgeler/Entegre/Zeytin%20Entegre%20M%C3%BCcadele%20Teknik%20Talimat%C4%B1.pdf',
  },
  elmaGKGM: {
    id: 'elmaGKGM', kurum: 'GKGM',
    baslik: 'Elma — Çiftçi Eğitim Serisi 4 (2016)',
    url: 'https://www.tarimorman.gov.tr/GKGM/Belgeler/Uretici_Bilgi_Kosesi/Dokumanlar/elma.pdf',
  },
  dmgBKU: {
    id: 'dmgBKU', kurum: 'BKÜ / Zirai Mücadele Teknik Talimatları',
    baslik: 'Doğu meyvegüvesi (Grapholita molesta)',
    url: 'https://bku.tarimorman.gov.tr/Zararli/KaynakDetay/416',
  },
  hububatGKGM: {
    id: 'hububatGKGM', kurum: 'GKGM',
    baslik: 'Hububat — Çiftçi Eğitim Serisi 18 (2016)',
    url: 'https://www.tarimorman.gov.tr/GKGM/Belgeler/Uretici_Bilgi_Kosesi/Dokumanlar/hububat.pdf',
  },
  bagGKGM: {
    id: 'bagGKGM', kurum: 'GKGM',
    baslik: 'Bağ — Çiftçi Eğitim Serisi',
    url: 'https://www.tarimorman.gov.tr/GKGM/Belgeler/Uretici_Bilgi_Kosesi/Dokumanlar/bag.pdf',
  },
  findikGKGM: {
    id: 'findikGKGM', kurum: 'GKGM',
    baslik: 'Fındık — Çiftçi Eğitim Serisi',
    url: 'https://www.tarimorman.gov.tr/GKGM/Belgeler/Uretici_Bilgi_Kosesi/Dokumanlar/findik.pdf',
  },
  misirGKGM: {
    id: 'misirGKGM', kurum: 'GKGM',
    baslik: 'Mısır — Çiftçi Eğitim Serisi',
    url: 'https://www.tarimorman.gov.tr/GKGM/Belgeler/Uretici_Bilgi_Kosesi/Dokumanlar/misir.pdf',
  },
  domatesGKGM: {
    id: 'domatesGKGM', kurum: 'GKGM',
    baslik: 'Domates — Çiftçi Eğitim Serisi 7 (2021)',
    url: 'https://www.tarimorman.gov.tr/GKGM/Belgeler/Uretici_Bilgi_Kosesi/Dokumanlar/domates_hastalik_ve_zararlilari_ile_mucadele.pdf',
  },
  acikDomatesEMTT: {
    id: 'acikDomatesEMTT', kurum: 'TAGEM',
    baslik: 'Açık Alan Domates Entegre Mücadele Teknik Talimatı (2022)',
    url: 'https://www.tarimorman.gov.tr/TAGEM/Belgeler/Entegre/A%C3%A7%C4%B1k%20Alan%20Domates%20Entegre%20M%C3%BCcadele%20Teknik%20Talimat%C4%B1.pdf',
  },
  patatesMildiyoBKU: {
    id: 'patatesMildiyoBKU', kurum: 'BKÜ / Zirai Mücadele Teknik Talimatları Cilt III',
    baslik: 'Patates mildiyösü (Phytophthora infestans)',
    url: 'https://bku.tarimorman.gov.tr/Zararli/KaynakDetay/1335',
  },
  patatesBocegiBKU: {
    id: 'patatesBocegiBKU', kurum: 'BKÜ / Zirai Mücadele Teknik Talimatları Cilt III',
    baslik: 'Patates böceği (Leptinotarsa decemlineata)',
    url: 'https://bku.tarimorman.gov.tr/Zararli/KaynakDetay/675',
  },
  kirazVisneEMTT: {
    id: 'kirazVisneEMTT', kurum: 'TAGEM',
    baslik: 'Kiraz ve Vişne Entegre Mücadele Teknik Talimatı (2022)',
    url: 'https://www.tarimorman.gov.tr/TAGEM/Belgeler/Entegre/Kiraz%20ve%20Vi%C5%9Fne%20Entegre%20M%C3%BCcadele%20Teknik%20Talimat%C4%B1.pdf',
  },
  kirazGKGM: {
    id: 'kirazGKGM', kurum: 'GKGM',
    baslik: 'Kiraz-Vişne — Çiftçi Eğitim Serisi 6 (2016)',
    url: 'https://www.tarimorman.gov.tr/GKGM/Belgeler/Uretici_Bilgi_Kosesi/Dokumanlar/kiraz.pdf',
  },
  kirazSinegiZMMAE: {
    id: 'kirazSinegiZMMAE', kurum: 'Zirai Mücadele Merkez Araştırma Enstitüsü',
    baslik: 'Çiftçi Bülteni: Kiraz sineği (2017/4)',
    url: 'https://arastirma.tarimorman.gov.tr/zmmae/Belgeler/Kutu%20Men%C3%BC/%C3%A7ift%C3%A7i%20b%C3%BClteni/kiraz_sine%C4%9Fi.pdf',
  },
  kirazSinegiElazig: {
    id: 'kirazSinegiElazig', kurum: 'Elazığ İl Tarım ve Orman Müdürlüğü',
    baslik: 'Kiraz Sineği İle Mücadele',
    url: 'https://elazig.tarimorman.gov.tr/Sayfalar/Detay.aspx?OgeId=509&Liste=Duyuru',
  },
  kirazSinegiMalatya: {
    id: 'kirazSinegiMalatya', kurum: 'Malatya İl Tarım ve Orman Müdürlüğü',
    baslik: 'Kiraz sineğine karşı yapılacak mücadele',
    url: 'https://malatya.tarimorman.gov.tr/Duyuru/338/Kiraz-Da-Kurtlanmaya-Sebep-Olan-Kiraz-Sinegine-Karsi-Yapilacak-Mucadele',
  },
  kayisiGKGM: {
    id: 'kayisiGKGM', kurum: 'GKGM',
    baslik: 'Kayısı — Çiftçi Eğitim Serisi',
    url: 'https://www.tarimorman.gov.tr/GKGM/Belgeler/Uretici_Bilgi_Kosesi/Dokumanlar/kayisi.pdf',
  },
  seftaliGuvesiBKU: {
    id: 'seftaliGuvesiBKU', kurum: 'BKÜ / Zirai Mücadele Teknik Talimatları Cilt IV',
    baslik: 'Şeftali güvesi (Anarsia lineatella)',
    url: 'https://bku.tarimorman.gov.tr/Zararli/KaynakDetay/355',
  },
  pamukEMTT: {
    id: 'pamukEMTT', kurum: 'TAGEM',
    baslik: 'Pamuk Entegre Mücadele Teknik Talimatı (2022)',
    url: 'https://www.tarimorman.gov.tr/TAGEM/Belgeler/Entegre/Pamuk%20Entegre%20M%C3%BCcadele%20Teknik%20Talimat%C4%B1.pdf',
  },
  pamukGapTeyap: {
    id: 'pamukGapTeyap', kurum: 'GAP İdaresi — GAP-TEYAP',
    baslik: 'Pamuktaki zararlıları örnekleme zamanı, yöntemi ve EZE',
    url: 'https://www.gapteyap.org/wp-content/uploads/2015/08/Pamuktaki-Zararl%C4%B1lar%C4%B1-%C3%96rnekleme-Zam.Y%C3%B6ntemi.pdf',
  },
  endustriZararliTagem: {
    id: 'endustriZararliTagem', kurum: 'TAGEM',
    baslik: 'Endüstri ve Süs Bitkileri Zararlıları Zirai Mücadele Teknik Talimatları',
    url: 'https://www.tarimorman.gov.tr/TAGEM/Belgeler/yayin/End%C3%BCstri%20ve%20S%C3%BCs%20Bitkileri%20Zararl%C4%B1lar%C4%B1%20Zirai%20M%C3%BCcadele%20Teknik%20Talimatlar%C4%B1.pdf',
  },
  cilElazig: {
    id: 'cilElazig', kurum: 'Elazığ İl Tarım ve Orman Müdürlüğü',
    baslik: 'Kayısı ağaçlarında çil (yaprakdelen) hastalığı',
    url: 'https://elazig.tarimorman.gov.tr/Duyuru/408/Kayisi-Agaclarinda-_cil_-Yaprakdelen-Hastaligina-Karsi-Ilaclama-Zamani',
  },
  kayisiMalatya: {
    id: 'kayisiMalatya', kurum: 'Malatya İl Tarım ve Orman Müdürlüğü',
    baslik: 'Kayısıda yaprak delen (çil) hastalığı',
    url: 'https://malatya.tarimorman.gov.tr/Duyuru/373/Kayisida-Yaprak-Delen-_cil_-Hastaligi',
  },
  tutunTripsiBKU: {
    id: 'tutunTripsiBKU', kurum: 'BKÜ / Zirai Mücadele Teknik Talimatları Cilt II',
    baslik: 'Pamukta tütün thripsi',
    url: 'https://bku.tarimorman.gov.tr/Zararli/KaynakDetay/1028',
  },
  yabanciOtTagem: {
    id: 'yabanciOtTagem', kurum: 'TAGEM',
    baslik: 'Yabancı Ot Zirai Mücadele Teknik Talimatları',
    url: 'https://www.tarimorman.gov.tr/TAGEM/Belgeler/yayin/Yabanc%C4%B1%20Ot%20Zirai%20M%C3%BCcadele%20Teknik%20Talimatlar%C4%B1.pdf',
  },
  aycicegiEMTT: {
    id: 'aycicegiEMTT', kurum: 'TAGEM',
    baslik: 'Ayçiçeği Entegre Mücadele Teknik Talimatı (2022)',
    url: 'https://www.tarimorman.gov.tr/TAGEM/Belgeler/Entegre/Ay%C3%A7i%C3%A7e%C4%9Fi%20Entegre%20M%C3%BCcadele%20Teknik%20Talimat%C4%B1.pdf',
  },
  aycicegiTTAE: {
    id: 'aycicegiTTAE', kurum: 'Trakya Tarımsal Araştırma Enstitüsü',
    baslik: 'Ayçiçeği Tarımı',
    url: 'https://arastirma.tarimorman.gov.tr/ttae/Sayfalar/Detay.aspx?SayfaId=54',
  },
};
