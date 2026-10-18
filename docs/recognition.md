# Katkı profili ve ekip takdiri

Genel bakış, cihazın yerel saatine göre kısa bir selamlama gösterir. Günün sözü aynı gün içinde sabit kalır. Katkı profilindeki seçenek bu mesajları cihazda kapatır; görev veya puan kaybı yaratmaz.

Sağ üstteki avatar ana içerik alanının tamamında **Profilim** görünümünü açar. Kendi puanların, beş rozetin, ilerlemen ve kaynak bağlantıların burada görünür. Sol menüye ayrı bir profil maddesi eklenmez; başka bir menü seçilerek profile dönülür. Projeler arasında puan birleştirilmez; sıralama ve çalışma saati takibi yapılmaz.

Profil yalnızca mevcut kayıtları gösterir. Kullanıcı geri bildirimiyle manuel katkı takdir/onay formu kaldırılmıştır; bu görünümden puan veya teşekkür oluşturulmaz. Aşağıdaki kurallar mevcut kayıtların hesaplama altyapısını açıklar. Yeni bir otomatik ödül mekanizması eklenmemiştir.

## Katkı kabul etme ve teşekkür

1. Tamamlanmış bir görev veya bilgi/inceleme/kilometre taşı kaydı oluşturulur. İnceleme ve kilometre taşı türleri Yeni kayıt menüsündedir. Her katkı sahibi GitHub kullanıcı adıyla eşleşir.
2. Altyapıdaki katkı kabul kaydı başka bir ekip üyesinin açık onayını gerektirir. Bu işlem hafıza kayıtlarını kanonik hale getirmez; mevcut insan incelemesi devam eder.
3. Kabul edilmiş görev 20, bilgi veya inceleme 10 puan kazandırır. Kilometre taşı katkısı puan eklemeden Birlikte Başardık rozetini açar.
4. Üye, başka bir üyeye ait kaynağa üç hazır teşekkür mesajından biriyle teşekkür edebilir. Her kaynak/gönderen çifti 5 puan getirir. Serbest metin veya özel sohbet paylaşılmaz.

Kimlik sunucunun yerel bağlantı ayarından gelir; istemciden gönderilen actor veya puan kabul edilmez. İşlem yapan ve katkı sahibi mevcut ekip üye listesinde bulunmalıdır. Kendi kendine işlem yapılamaz. Yerel kişisel alanlarda profil açılır, fakat ekip üyeliği olmadan karşılıklı ödül verilemez. Bu, mevcut loopback uygulamasının güven modelini kullanır; imzalı kimlik doğrulaması veya hileye dayanıklı bir çalışan performans sistemi değildir.

## Rozetler

| Rozet | Koşul |
| --- | --- |
| İlk Adım | Bir kabul edilmiş katkı |
| Bilgi Paylaşan | Beş kabul edilmiş bilgi kaydı |
| Dikkatli Göz | On kabul edilmiş inceleme kaydı |
| Takım Arkadaşı | Üç farklı üyeden kaynaklı teşekkür |
| Birlikte Başardık | Bir kabul edilmiş kilometre taşı katkısı |

Kazanılan rozetler profil vitrininin ödülleridir. Tarih ve kaynakları görünür; henüz kazanılmamış rozetlerde hedefe ilerleme gösterilir.

## Kalıcılık ve yeniden hesaplama

Her takdir ayrı bir JSON dosyasıdır: `teams/<team>/projects/<project>/collaboration/recognition/<sha256>.json`. Mevcut ekip senkron kapsamına dahildir. Otomatik senkron kapalıysa yerelde kalır. Ham sohbetler ve kaynak gövdeleri bu dosyalara kopyalanmaz. `shared/` içine ödül verisi yazılmaz.

Puanlar her okumada kaynaklardan ve takdir kayıtlarından yeniden hesaplanır. Tek bir kaynak sürümü bir kez kabul edilebilir; teşekkür kaydı gönderen bazında tekildir. Kaynak içeriği veya sahibi değişince eski takdirler geçersizleşir ve yeni sürüm incelenebilir. Kaynak silinince veya görev açılınca puanlar ve rozet ilerlemesi çıkarılır. Aynı görev yeniden tamamlanırsa önceki puanı geri gelir, ikinci bir ödül verilmez. Güncel kaynaklara verilen onayların toplamı profil ekranındaki ekip kutlamasının temelidir.

Otomatik oturum, commit ve sohbet kayıtları kendiliğinden puan üretmez. Bilgi olarak sunulan bir kayıt da ancak başka bir üyenin açık kabulünden sonra puan getirir.
