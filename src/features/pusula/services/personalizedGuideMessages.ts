/**
 * Kişisel Pusula ipuçları: yalnız kullanıcının kaydettiği tarla/ürün/konum
 * bilgilerine dayanır. Canlı analiz/tahmin veya yapılmış işlem iddiası içermez.
 * Gerçek sayfa içgörüsü hazırsa GlobalPusulaBand her zaman onu önceliklendirir.
 */
export type GuideMessage = { title: string; text: string };
export type PersonalGuideContext = {
  fieldName?: string | null;
  crop?: string | null;
  city?: string | null;
  district?: string | null;
  fieldCount?: number;
};

function safeName(value: string | null | undefined) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 70);
  if (!text || /^(?:ürün belirtilmedi|urun belirtilmedi|bilinmiyor|unknown|null|undefined|seçilmedi)$/i.test(text)) {
    return '';
  }
  return text;
}

/** İki ek mesaj: biri seçili tarlaya, diğeri kayıtlı ürüne/ile odaklanır. */
export function personalizedGuideMessages(
  screen: string,
  ctx: PersonalGuideContext,
): GuideMessage[] {
  const hasField = Number(ctx.fieldCount ?? 0) > 0;
  const field = hasField ? safeName(ctx.fieldName) : '';
  const crop = hasField ? safeName(ctx.crop) : '';
  const city = hasField ? safeName(ctx.city) : '';
  const district = hasField ? safeName(ctx.district) : '';
  const location = [district, city].filter(Boolean).join(' / ');
  const messages: GuideMessage[] = [];
  const addField = (title: string, text: string) => {
    if (field) messages.push({ title, text: `Seçili tarlan: ${field}. ${text}` });
  };
  const addCrop = (title: string, text: string) => {
    if (crop) messages.push({ title, text: `Kayıtlı ürünün: ${crop}. ${text}` });
  };

  switch (screen) {
    case 'inventoryHub':
      addField('Deponu tarlana göre inceleyelim', 'Depodaki ürünlerin bu tarla ile eşleşip eşleşmediğini ve varsa kalan miktarlarını kontrol edebilirsin.');
      addCrop('Ürüne göre depo takibi', 'Bu ürün için kullandığın girdiler kayıtlıysa hangi dönemde ve ne kadar kullandığını Tarla Defteri ile karşılaştırabilirsin.');
      break;
    case 'marketHub':
      addCrop('Ürünün için fiyatı doğru karşılaştıralım', 'Piyasa kayıtlarında tarih, kalite ve ölçü birimini karşılaştır; eski fiyatı güncel teklif gibi değerlendirme.');
      addField('Tarlanı maliyetle birlikte düşün', 'Piyasa fiyatını değerlendirirken varsa bu tarlanın kayıtlı girdi ve üretim maliyetlerini de hesaba kat.');
      break;
    case 'weatherHub':
      addField('Tarlanın hava koşullarını izleyelim', 'Güncel saatlik tahminde rüzgâr, yağış ve sıcaklığı birlikte inceleyerek planladığın saha işini değerlendirebilirsin.');
      if (location) messages.push({ title: 'Konumuna uygun hava değerlendirmesi', text: `Tarlanın kayıtlı konumu: ${location}. Tahminin hangi nokta ve saat için geçerli olduğunu kontrol et; bu mesaj bir hava uyarısı değildir.` });
      break;
    case 'fieldControlHub':
      addField('Tarlanın uydu geçmişini aç', 'Son görüntü tarihi ile önceki görüntüyü karşılaştır. Tek bir NDVI değerinden hastalık veya susuzluk teşhisi çıkarmayalım.');
      addCrop('Ürün dönemini de hesaba katalım', 'Uydu değişimini yorumlarken ekim, gelişme ve hasat döneminin etkisini göz önünde bulundur.');
      break;
    case 'soilAnalysisHub':
      addField('Tarlanın toprak kaydını karşılaştıralım', 'Varsa laboratuvar sonucunu seçili tarlanın tahmini toprak profiliyle yan yana inceleyebilirsin.');
      addCrop('Toprak sonucunu ürüne bağlayalım', 'Toprak pH ve besin değerleri tek başına gübre dozu belirlemez; ürün dönemi ve gerçek analizle birlikte yorumlanmalı.');
      break;
    case 'supportHub':
      if (city) messages.push({ title: 'İline göre destekleri inceleyelim', text: `Kayıtlı ilin: ${city}. Başvuru yapmadan önce güncel resmî şartların bu il ve ürün için geçerli olduğuna bak.` });
      addCrop('Ürününe uygun destekleri ara', 'Destek kapsamı, üretim yılı ve başvuru takvimini resmî duyurudan doğrula.');
      break;
    case 'agendaHub':
      addCrop('Gündemde ürününe ilişkin gelişmeleri ara', 'Haberin tarihini ve kaynağını kontrol edip gerçekten üretim kararını etkileyip etkilemediğine bak.');
      addField('Haberleri tarlanla ilişkilendirelim', 'Genel bir tarım haberi bu tarlaya doğrudan uygulanamayabilir; yerel koşul ve ürün kaydını göz önünde bulundur.');
      break;
    case 'nutritionHub':
      addCrop('Ürünün beslenmesini doğru okuyalım', 'Belirti fotoğrafını tek başına eksiklik kabul etmeyelim; mümkünse yaprak ve toprak analizleriyle birlikte karşılaştıralım.');
      addField('Besin takibini tarlaya bağlayalım', 'Varsa önceki gübreleme tarihlerini ve analiz sonuçlarını birlikte incelemek daha güvenilir olur.');
      break;
    case 'pestGuideHub':
      addCrop('Ürününe göre rehberde ara', 'Hastalık ve zararlı rehberinde ürününle eşleşen belirtileri incele; görüntü benzerliği kesin teşhis değildir.');
      addField('Saha gözlemini kaydet', 'Gördüğün belirtinin yerini, tarihini ve varsa fotoğrafını bu tarlanın kayıtlarına ekleyebilirsin.');
      break;
    case 'producerMarketHub':
      addCrop('Ürün ilanını daha anlaşılır hazırla', 'Satış düşünüyorsan miktarı, kaliteyi ve teslim koşullarını belirt; güncel teklif olmadan fiyat varsaymayalım.');
      addField('Teslim koşullarını planla', 'Konum ve nakliye masrafını hesaba katmadan iki teklifi eşdeğer kabul etme.');
      break;
    case 'fieldNotebookHub':
      addField('Bu tarlanın işlem geçmişini tamamlayalım', 'Sulama, gübreleme ve gözlem tarihlerini doğru kaydetmen sonraki karşılaştırmalarda işimize yarar.');
      addCrop('Ürün dönemlerini kaydet', 'Ürün gelişim döneminin tarihlerini not edersen sonraki sezon değişimlerini daha iyi karşılaştırabiliriz.');
      break;
    case 'notificationsHub':
      addField('Bu tarlaya ilişkin uyarıları ayıralım', 'Güncel risk bildirimi varsa önce kaynak tarihini ve hangi tarla için üretildiğini kontrol et.');
      addCrop('Ürün bildirimlerinin bağlamı önemli', 'Her genel tarım haberini acil uyarı saymayalım; ürününle ilişkili ve doğrulanmış olanları öne çıkar.');
      break;
    case 'settingsHub':
      addField('Seçili tarla bilgisini gözden geçir', 'Konum, ürün ve sezon kaydı güncelse Pusula önerilerini doğru bağlamda hazırlayabilir.');
      addCrop('Ürün kaydın güncel mi?', 'Sezon veya ürün değiştiyse kaydı yenile; geçmiş sezona göre yorum yapılmasını önle.');
      break;
    case 'calendar':
      addField('Bu tarlanın işleri için plan yap', 'Planladığın işlemleri tarihe bağla; uygulama yapılmadan tamamlandı olarak işaretleme.');
      addCrop('Ürün dönemine göre görevlerini gözden geçir', 'Ekim, bakım ve hasat kayıtların varsa bunları takvimle birlikte takip edebilirsin.');
      break;
    case 'aiAnalysis':
      addField('Fotoğrafı doğru tarlayla eşleştir', 'Bir belirtiyi inceliyorsan fotoğrafın tarihini ve hangi bölümden çekildiğini kaydet.');
      addCrop('Ürün bilgisi analizi güçlendirir', 'Fotoğrafın bu ürüne ait olduğundan emin ol; görsel analiz tek başına kesin hastalık teşhisi değildir.');
      break;
    default:
      break;
  }

  return messages;
}
