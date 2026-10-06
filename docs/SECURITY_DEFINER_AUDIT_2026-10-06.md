# TarlaPusula SECURITY DEFINER Audit — 2026-10-06

## Sonuç

Supabase Security Advisor denetimi fonksiyon bazında tamamlandı.

- Başlangıç: authenticated tarafından çağrılabilen 23 `SECURITY DEFINER` fonksiyon uyarısı.
- Düzeltme sonrası: 22 uyarı.
- `tp_assign_field_sort_order()` yalnız trigger fonksiyonudur; Data API üzerinden doğrudan çalıştırma yetkisi authenticated/anon/public rollerinden kaldırıldı.
- Kalan 22 fonksiyon, istemci tarafından çağrılan kontrollü RPC gateway'leridir. Bu fonksiyonlar RLS'yi bilinçli biçimde aşabilmek için `SECURITY DEFINER` kullanır ve fonksiyon gövdelerinde kullanıcı/alan sahipliği veya sınırlı işlem kontrolü uygulanır.

## Bu turda kapatılan gerçek riskler

### PusulaPDF yetki bypass

`request_pusulapdf(p_field_id)` artık:

- oturum zorunlu tutar,
- `p_field_id` değerinin `auth.uid()` kullanıcısına ait olduğunu doğrular,
- gerçek backend planının `premium` olmasını zorunlu tutar,
- bundan sonra mevcut/yeniden kullanılan job kontrolüne ve yeni job eklemeye geçer.

Bu sayede yalnız frontend Premium kilidine güvenilmez.

### Pusula puanı sahte RPC çağrısı

`tp_award_points(...)` daha önce aktif bir `rule_key` ve yeni bir dedupe anahtarı verilerek kötüye kullanılabilirdi.

Artık:

- `DAILY_LOGIN`: tarih ve dedupe server tarafından İstanbul tarihine göre üretilir.
- `ADD_INVENTORY`: gerçek ve kullanıcıya ait `farm_inventory_products` kaydı doğrulanır.
- `ADD_SOIL_ANALYSIS`: gerçek ve kullanıcıya ait `soil_analyses` kaydı doğrulanır.
- `PEST_ANALYSIS`: tamamlanmış, kullanıcıya ait `ai_image_analysis_jobs` + gerçek `photo_hash` doğrulanır.
- `FIELD_OBSERVATION_PHOTO`: gerçek saha fotoğrafı kaydı veya legacy saha kontrolü aktivitesi doğrulanır.
- `WATCH_AD`: doğrudan puan vermez; mevcut SSV doğrulama yolu zorunludur.
- Görev ödülleri: ilgili doğrulamalı task RPC'leri üzerinden verilir.
- `ADD_CROP` ve `INVITE_FRIEND`: ayrı server-verifiable event kaynağı kurulana kadar doğrudan self-award yapamaz.

## Kalan 22 SECURITY DEFINER uyarısının sınıflandırması

### AI kota / entitlement
- `check_ai_access`
- `consume_ai_access`
- `get_ai_access_status`
- `refund_ai_access`

Kullanıcı kimliği `auth.uid()` üzerinden alınır; kota ve kullanım satırları çağıran kullanıcıya bağlıdır.

### Kullanıcıya ait tarla/işlem gateway'leri
- `get_regional_pest_disease_radar`
- `request_pusulapdf`
- `tp_complete_action_task`
- `tp_complete_field_task`
- `tp_create_field_operation`
- `tp_delete_field_operation`
- `tp_find_cached_ai_image_analysis`
- `tp_refresh_action_tasks`
- `tp_reorder_fields`
- `tp_sync_field_tasks`
- `tp_sync_model_readiness_tasks`
- `tp_sync_phenology_stage_notification`
- `upsert_yield_harvest_evidence`

Bu RPC'ler `auth.uid()` ve/veya `fields.user_id` / ilgili user_id sahiplik kontrolü kullanır.

### Gamification
- `tp_get_gamification_state`
- `tp_award_points`

State kullanıcının kendi kaydından okunur. Award gateway bu audit turunda DB-backed verification ile sertleştirildi.

### İçerik / bildirim
- `content_record_view`
- `check_price_alerts_now`

`content_record_view` yalnız published içerik görüntülenme sayacını artırır. `check_price_alerts_now` yalnız `auth.uid()` kullanıcısının aktif fiyat alarmlarını işler.

### Admin kontrolü
- `is_admin`

Yalnız `admin_users.user_id = auth.uid()` varlığını kontrol eder.

## RLS enabled / no policy bilgileri

Security Advisor 13 tablo için "RLS enabled no policy" INFO üretmektedir. Denetimde bu tabloların tamamında:

- anon SELECT/INSERT yok,
- authenticated SELECT/INSERT/UPDATE/DELETE yok,
- service_role erişimi mevcut.

Dolayısıyla bunlar doğrudan client erişimine kapalı servis-içi tablolardır:

- admob_reward_receipts
- agml_disease_reference_catalog
- dssat_crop_reference_mappings
- dssat_variety_mapping_requests
- dssat_variety_mappings
- internal_service_config
- model_shadow_calibration_states
- model_shadow_comparisons
- official_source_snapshots
- pcse_variety_mapping_requests
- pusula_experiment_states
- regional_pest_disease_observations
- subscription_webhook_events

Bu INFO bulguları mevcut mimaride yayın engelleyicisi değildir.

## Bilinen kalan uyarı

Supabase leaked-password protection Free planda kapalıdır. Bu özellik plan yükseltmesi gerektirir ve mevcut release için tek başına blocker kabul edilmemiştir.

## Kural

Yeni `SECURITY DEFINER` fonksiyon eklenirse:
1. `search_path` sabitlenmeli.
2. `auth.uid()` / service-role doğrulaması açık olmalı.
3. Kullanıcıya ait ID parametreleri server-side ownership kontrolünden geçmeli.
4. anon/public EXECUTE varsayılan bırakılmamalı.
5. Security Advisor yeniden çalıştırılmalı.
