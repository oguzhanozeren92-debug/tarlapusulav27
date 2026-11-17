import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateWaterNeed, matchRehberCrops, pickStation, systemFromFieldMethod, decadeOf } from './waterNeed.service.ts';

const data = JSON.parse(readFileSync(new URL('../../../../public/data/bitki-su-tuketimi.json', import.meta.url), 'utf8'));
const st = (name) => data.istasyonlar.find((s) => s.ad === name);

test('veri: 259 istasyon, hepsinde ETo ve yağış 36 dönem', () => {
  assert.equal(data.istasyonlar.length, 259);
  for (const s of data.istasyonlar) {
    assert.equal(s.eto.length, 36); assert.equal(s.yagis.length, 36);
    assert.ok(Object.keys(s.bitkiler).length > 0, s.ad);
  }
});

test('rehberdeki değerler birebir: Elazığ kışlık buğday 574 mm, şekerpancarı 1010 mm', () => {
  const e = st('Elazığ');
  assert.equal(e.bitkiler['Buğday (Kışlık)'].toplam, 574);
  assert.equal(e.bitkiler['Şekerpancarı'].toplam, 1010);
  assert.equal(e.bitkiler['Buğday (Kışlık)'].kaynak, 'rehber');
});

test('tablosu bozuk istasyonlar hesapla tamamlandı (Kayseri, Trabzon)', () => {
  for (const name of ['Kayseri', 'Trabzon', 'Kars']) {
    const s = st(name);
    const crops = Object.values(s.bitkiler);
    assert.ok(crops.length > 10, name);
    assert.ok(crops.every((c) => c.kaynak === 'hesap'));
  }
});

test('ürün eşleme: ana ürün önce, 2. ürün sonra; birebir karşılığı olmayan boş', () => {
  const names = Object.keys(st('Adana').bitkiler);
  assert.equal(matchRehberCrops('Buğday', names)[0], 'Buğday (Kışlık)');
  assert.equal(matchRehberCrops('Domates', names)[0], 'Domates (Yer)');
  assert.equal(matchRehberCrops('Mısır', names)[0], 'Mısır (Dane)');
  assert.deepEqual(matchRehberCrops('Portakal', names), ['Narenciye']);
  assert.deepEqual(matchRehberCrops('Lavanta', names), []);
  assert.ok(matchRehberCrops('Fasulye', names).every((n) => n.startsWith('Fasülye')));
});

test('istasyon seçimi: en yakın ve ürünü olan; çok uzaksa yok; koordinat yoksa il', () => {
  const pick = pickStation(data.istasyonlar, 'Buğday', { lat: 38.67, lng: 39.22 });
  assert.equal(pick.station.ad, 'Elazığ');
  assert.ok(pick.distanceKm < 5);
  assert.equal(pickStation(data.istasyonlar, 'Buğday', { lat: 52, lng: 13 }), null);
  const byCity = pickStation(data.istasyonlar, 'Buğday', { city: 'Elazığ' });
  assert.equal(byCity.station.ad, 'Elazığ'); assert.equal(byCity.basis, 'il');
});

test('rehber formülleri: net = ETc − 0,8×yağış; damla Ps/85; brüt = net/(Ea×0,98)', () => {
  const s = st('Elazığ');
  const crop = 'Şekerpancarı';
  const etc = s.bitkiler[crop].etc;
  const r = calculateWaterNeed(s, crop, { system: 'yuzey', today: new Date(2026, 6, 15) });
  const expectNet = etc.reduce((sum, v, i) => sum + (v > 0 ? Math.max(0, v - s.yagis[i] * 0.8) : 0), 0);
  assert.equal(r.seasonNet, Math.round(expectNet * 10) / 10);
  assert.equal(r.seasonGross, null); // yüzey sulamada rehber randıman vermez
  const d = calculateWaterNeed(s, crop, { system: 'yuzey_damla', shadePercent: 80, today: new Date(2026, 6, 15) });
  const expectDrip = etc.reduce((sum, v, i) => sum + (v > 0 ? Math.max(0, v * 80 / 85 - s.yagis[i] * 0.8) : 0), 0);
  assert.equal(d.seasonNet, Math.round(expectDrip * 10) / 10);
  assert.equal(d.seasonGross, Math.round(d.seasonNet / (0.9 * 0.98) * 10) / 10);
  assert.equal(d.current.decade, 19); // 15 Temmuz → Temmuz II
  assert.equal(d.current.inSeason, true);
});

test('yardımcılar', () => {
  assert.equal(systemFromFieldMethod('trickle'), 'yuzey_damla');
  assert.equal(systemFromFieldMethod('furrow_alternating'), 'yuzey');
  assert.equal(decadeOf(new Date(2026, 0, 10)), 0);
  assert.equal(decadeOf(new Date(2026, 11, 31)), 35);
});
