# TarlaPusula pySTICS Worker — Madde 14.8

Bu worker `pystics==1.2.5` için ayrı Python 3.11 runtime sağlar. TarlaPusula web uygulaması yalnız `VITE_PYSTICS_WORKER_URL` üzerinden konuşur.

## Güvenlik modeli

- `/health`: runtime ve doğrulanmış Türkiye common_wheat profil ID'lerini döndürür.
- `/v1/pystics/smoke-test`: upstream `common_wheat / Talent` örneğini yalnız runtime testi için çalıştırır. **Türkiye kalibrasyonu değildir.**
- `/v1/pystics/simulate-calibrated`: yalnız `calibration/profiles.json` içinde `validated + TR + common_wheat + approved_for_shadow=true` profil varsa açılır.
- Worker hiçbir endpointte gübre reçetesi veya kg/da N üretmez.
- TarlaPusula'da production besin otoritesi `soil-nutrition-engine` olarak kalır.

## Uygulama env

```text
VITE_PYSTICS_WORKER_URL=https://<worker-host>
VITE_PYSTICS_TR_WHEAT_PROFILE_ID=<yalnız doğrulanmış profil id>
```

İkinci env boşsa worker bağlı olsa bile Türkiye buğdayı shadow simulation kapısı kapalı kalır.
