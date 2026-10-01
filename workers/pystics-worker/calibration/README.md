# Türkiye buğdayı kalibrasyon profilleri

Bu klasör **boş başlamalıdır**. `profiles.json` içine yalnız saha/veri seti ile doğrulanmış profiller eklenir.

Bir profil `status: "validated"`, `country: "TR"`, `crop: "common_wheat"` ve `approved_for_shadow: true` olmadıkça worker `/simulate-calibrated` çağrısını reddeder.

Profilin referans verdiği crop/soil/initial/station/manage XML dosyaları bu klasör altında bulunmalıdır. `Talent` örneği burada production profili olarak kullanılmaz.
