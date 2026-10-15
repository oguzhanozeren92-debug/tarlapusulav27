/**
 * Human-checked primary-source reading notes, NOT a general model answer bank.
 * Each entry may be used only for the exact source URL and matching subject.
 * The source's first page was visually inspected on 2026-10-16.
 * Original prose is paraphrased to avoid reproducing the document.
 * Candidate still requires explicit administrator approval.
 */
export const VERIFIED_PDF_NOTES: Record<string,{
  topic_terms:string[];
  evidence:string;
  card:{title:string;summary:string;points:string[];practice:string;caution:string;keywords:string[]};
}> = {
  "https://arastirma.tarimorman.gov.tr/zmmae/Belgeler/Kutu%20Men%C3%BC/%C3%A7ift%C3%A7i%20b%C3%BClteni/Hububatta%20so%C4%9Fuk%20ve%20don%20zarar%C4%B1.pdf": {
    "topic_terms": [
      "don",
      "soguk",
      "hububat",
      "bugday",
      "arpa"
    ],
    "evidence": "TAGEM Zirai Mücadele Merkez Araştırma Enstitüsü, 2021, Hububatta Soğuk ve Don Zararı, birinci sayfadan görsel inceleme ile kontrol edilmiş notlar: Soğuk ve ani sıcaklık değişimleri hububatta verim kaybına yol açabilir. Hassasiyet, çeşide ve bitkinin gelişme dönemine bağlı olarak değişebilir; ekim zamanı, konum ve yetiştirme uygulamaları da zararı etkiler. Serin iklim tahıllarında soğuğa dayanıklılık bakımından çavdar ve tritikale ile buğday ve arpa arasında farklılıklar belirtilir. Kardeşlenme ve sonraki dönemlerde yapraklarda beyazlaşma, yaprak uçlarında iğneleşme ve haşlanmış gibi sulu görünüm görülebilir. Başaklarda şekil bozukluğu, çiçeklenmede zarar ve dane bağlayamama görülebilir. Belge soğuktan zarar görmüş arpa fideleri ve arpa başaklarının fotoğraflarını içerir. Bu notlar ilaçlama veya gübreleme dozu içermez.",
    "card": {
      "title": "Hububatta Soğuk ve Don Zararını Tanı",
      "summary": "Buğday, arpa ve diğer serin iklim tahıllarında ani soğuklar gelişme dönemine göre yaprak, başak ve dane oluşumunda farklı belirtiler oluşturabilir.",
      "points": [
        "Soğuk olayından sonra tarlayı kontrol ederken yalnız yaprak rengini değil, bitkinin hangi gelişme döneminde olduğunu da dikkate al. Kardeşlenme, başak çıkarma ve çiçeklenme dönemleri farklı etkilenebilir.",
        "Yapraklarda beyazlaşma, uçlarda iğneleşme ve sulu veya haşlanmış gibi görünüm soğuk zararına işaret edebilir; tek bir belirtiyle kesin teşhis koyma.",
        "Başakların şeklinde bozulma ve çiçeklenme döneminden sonra dane bağlamama, soğuk etkisiyle ilişkili olabilir. Sağlam görünen bitkilerle hasarlı görünenleri karşılaştır.",
        "Çeşit, ekim zamanı, tarlanın konumu ve yapılan yetiştirme uygulamaları zararın düzeyini etkileyebilir. Bir tarladaki sonucu bütün bölge için aynı kabul etme."
      ],
      "practice": "Soğuk olayından sonra tarlanın birkaç farklı noktasında yaprak ve başakları incele, fotoğraf çek ve şüpheli alanları not ederek sonraki günlerde değişimi izle.",
      "caution": "Belirtiler başka streslerle karışabilir. Uygulama veya gübre kararı vermeden önce yerel koşulları değerlendir ve gerekiyorsa bir ziraat mühendisine danış.",
      "keywords": [
        "don",
        "soğuk",
        "buğday",
        "arpa",
        "hububat"
      ]
    }
  }
};
