# https://sorcery0358.github.io/tellak-hamam-brawler/
<img width="300" height="300" alt="frame" src="https://github.com/user-attachments/assets/087ae8bc-7115-45ea-a25e-4633d7203b07" />

# Tellak — Hamam Brawler
## Technical Design Document (TDD)

**Course:** BMI4242 Game Programming  
**Department:** Computer Engineering  
**Academic Year:** 2025/2026 Spring  
**Instructor:** Asst. Prof. Dr. Alpay DORUK  

---

### Team Members and Roles
* **Core Loop & State Engine Architecture:** Lead Game Programmer (Game Loop, React Architecture & Audio Pipelines)
* **Procedural Animation & Mathematics:** Engine Programmer (Pure functional animation mechanics, trigonometry, and Easing layers)
* **Algorithmic Pathfinding & Navigation Physics:** AI Specialist (BFS/NavGrid implementation and canvas-based spatial masking)
* **UI/UX & Asset Pipelines:** Audio & Asset Integrator (AI-assisted 32-bit sprite asset design, sound layout management, and UI reactivity)

---

## 1. Game Overview

### Elevator Pitch
*Tellak — Hamam Brawler*, geleneksel Türk hamamı atmosferinde geçen, oyuncunun hamamı basan kötü adamları (külhanbeyleri/magandaları) Osmanlı tokadı ve tekmelerle saf dışı bıraktığı, canı azaldığında ise milli içeceğimiz **sodalı ayran** içerek enerjisini topladığı, modern web teknolojileriyle yazılmış dinamik bir 2D "top-down beat 'em up" aksiyon oyunudur.

### Core Mechanics
* **8-Yönlü Hareket (8-Way Movement):** Oyuncu `W`, `A`, `S`, `D` tuşlarını kullanarak hamam haritasında serbestçe hareket eder. Karakterin baktığı yön, farenin konumuna veya hareket vektörüne göre anlık güncellenir.
* **Saldırı Komboları ve Yetenekler:**
  * **Yumruk (Punch - `J`):** 1 hasar puanı verir, 1 saniye bekleme süresi (cooldown) vardır.
  * **Tekme (Kick - `K`):** 2 hasar puanı verir, 2 saniye bekleme süresi vardır.
  * **Osmanlı Tokadı (Ottoman Slap - `L`):** Alan hasarı (AoE) vurur, menzildeki tüm düşmanlara 3 hasar puanı verir. 10 saniye bekleme süresine sahiptir ve düşmanları **%25 ihtimalle tek vuruşta anında yok etme (Instakill)** şansına sahiptir.
* **Can Yenileme (Sodalı Ayran - `B`):** Oyuncunun canı (`HP`) azaldığında sodalı ayran içerek can barını anında tamamen doldurur. Mekaniğin kötüye kullanımını engellemek amacıyla 30 saniyelik bir bekleme süresi bulunmaktadır.
* **Zorluk Skalası (Dynamic Spawning):** Oyun ilerledikçe düşmanların geliş hızı ve dalga yoğunluğu artar. Oyuncu düşmanları temizledikçe skoru (`Kill Count`) ve toplam vurduğu hasar HUD üzerinden güncellenir.

### Win/Loss Conditions
* **Win Condition (Kazanma Şartı):** Oyun sonsuz dalga (endless survival) modundadır; oyuncunun amacı hamamda hayatta kalabildiği kadar uzun süre kalıp maksimum külhanbeyini etkisiz hale getirerek en yüksek skora ulaşmaktır.
* **Loss Condition (Kaybetme Şartı):** Oyuncunun canı (`PLAYER_MAX_HP = 10`) sıfıra düştüğünde oyun durur, `endofgame` ses efekti tetiklenir ve ekranda "Game Over" paneli belirir.

---

## 2. Software Architecture

### High-Level Structure
Oyun, modern bir web stack bileşimi olan **React (v18)** mimarisi üzerine kurulu **Custom 2D HTML5 Canvas Game Engine** ile geliştirilmiştir. Sanal DOM (Virtual DOM) hantallığından kaçınmak ve akıcı bir oyun deneyimi (60 FPS) sunabilmek amacıyla, oyunun çekirdek motoru ve çizim döngüsü tamamen **React Hooks (`useRef`)** ve optimize edilmiş saf JavaScript fonksiyonları ile sarmalanmıştır. 

* **UI Katmanı (React State):** Sadece menü geçişleri, ses ayarları ve HUD (Can barı, Cooldown göstergeleri, Skor) gibi düşük frekanslı güncellenmesi gereken arayüz öğelerini yönetir.
* **Oyun Döngüsü Katmanı (Direct DOM & Canvas Render):** `requestAnimationFrame` veya yüksek çözünürlüklü zaman tabanlı `performance.now()` döngüleri kullanılarak karakterler, efektler ve düşmanların mantıksal durumları bellekte güncellenir ve Canvas üzerine doğrudan çizilir.

### Core Managers / Controllers
Oyun mimarisi modüler referans nesneleri aracılığıyla şu alt sistemlere ayrılmıştır:
1. **Input Controller:** `arena.current.keys` adında bir `Set` veri yapısı tutarak klavyeden basılan tuşları (WASD + JKLB) asenkron olarak dinler. Bu sayede çoklu tuş basımlarında (örneğin çapraz koşarken aynı anda yumruk atma) girdi kaybı yaşanmaz.
2. **Animation Manager (`window.TELLAK`):** `anim.js` dosyasında yer alan bu modül, sprite tabanlı animasyonları statik kareler (frame-by-frame sheets) yerine **Matematiksel Prosedürel Animasyon (Procedural Animation)** motoruyla yönetir.
3. **Audio Manager:** Ses efektlerini (`sounds.current`) kategorize edilmiş klasör yapılarından asenkron yükler. Arka plan müziği (`background`), hasar verme (`damagegiven`), hasar alma (`damagetaken`), ayran içme (`drinkingayran`), oyun bitişi (`endofgame`) ve düşman ölümü (`enemydeath`) ses dosyalarını lineer ses şiddeti eşitleme (`syncAudioVolumes`) algoritması ile dinamik olarak kontrol eder.

### Design Patterns
* **Singleton Pattern / Namespace Isolation:** Tüm animasyon ve yardımcı matematik kütüphaneleri `(function () { ... })()` şeklinde bir IIFE (Immediately Invoked Function Expression) içerisine alınarak `window.TELLAK` global nesnesine bağlanmıştır. Bu sayede bellek kirliliği (Global Scope Pollution) engellenmiştir.
* **State Pattern (Durum Makinesi):** Karakterlerin ve düşmanların anlık durumları (Koşma, Vurma, Ayran İçme, Darbe Alma, Ölme) durum değişkenleri üzerinden yönetilir. Örneğin oyuncu `drink` durumundayken hareket girdileri kilitlenir.
* **Data-Driven Architecture (Veri Güdümlü Tasarım):** Yön vektörleri ve animasyon eğrileri sabit konfigürasyon nesnelerinde (`DIRS`, `pose`) tutulur. Kod içerisinde hardcoded değerler yerine bu veri tabloları sorgulanır.

---

## 3. Algorithmic Implementation & Data Structures

### Data Structures (Veri Yapıları)
* **Navigasyon Izgarası (2D Flattened Grid Array):** `navGrid.current` yapısı, hamam haritasındaki yürünebilir alanları tutmak için 2 boyutlu matris yerine tek boyutlu, ardışık bellek bloklarından oluşan optimize edilmiş bir **`Uint8Array`** kullanır. Hücre koordinatları $(x, y)$ formülüne göre tekil bir indekse dönüştürülür:
  $$	ext{index} = y 	imes w + x$$
* **BFS Arama Kuyruğu (Typed Array Queue):** Yapay zeka yol bulma algoritmasında, JavaScript'in yerleşik `Array.push/shift` fonksiyonlarının oluşturduğu $O(N)$ yeniden indeksleme (re-indexing) maliyetini sıfırlamak için sabit boyutlu bir **`Int32Array`** ve iki işaretçi (`head`, `tail`) ile çalışan yüksek performanslı bir **Kuyruk (Queue)** veri yapısı implement edilmiştir.
* **Düşman Havuzu (Linear Dynamic Array):** Aktif olan tüm düşman nesneleri `enemiesRef.current` dizisinde saklanır. Her karede (frame) bu dizi taranarak ölü düşmanlar filtrelenir ve bellekten temizlenir.

### Algorithms (Algoritmalar ve Matematiksel Modeller)

#### 1. Resim İşleme Tabanlı Mekansal Maskeleme (Canvas-Based Spatial Masking)
Oyun yüklenirken `movinganddrinkingspaces.jpg` isimli maske görseli görünmeyen bir canvas'a çizilir ve hamamın yürünebilir (`ZONE_GREEN`) ve kısıtlı alanları (`ZONE_PINK`) RGB renk uzaklığı formülü (Manhattan Distance) ile taranır:
$$	ext{Distance} = |R_{	ext{pixel}} - R_{	ext{zone}}| + |G_{	ext{pixel}} - G_{	ext{zone}}| + |B_{	ext{pixel}} - B_{	ext{zone}}|$$
Belirlenen tolerans değerinin (`ZONE_TOL = 70`) altında kalan pikseller `zoneMask.current.cells` içerisine `1` veya `2` olarak yazılır. Bu sayede harita tasarımı değiştikçe kod yazmaya gerek kalmadan sadece maske görseli değiştirilerek fizik sınırları güncellenebilmektedir.

#### 2. AI Genişlik Öncelikli Arama (BFS Pathfinding)
Düşmanların (külhanbeyleri) hamam içerisinde oyuncuyu akıllıca takip edebilmesi için `findNavPath` fonksiyonu altında bir **Breadth-First Search (BFS)** algoritması çalışır.
* Harita `NAV_CELL_SIZE = 18` piksellik hücrelere bölünür.
* Algoritma, düşmanın bulunduğu hücreden başlayarak 4 yönlü (`[1, 0]`, `[-1, 0]`, `[0, 1]`, `[0, -1]`) komşuluk matrisini tarar.
* Ziyaret edilen hücrelerin ebeveyn bilgileri `parents` dizisinde tutulur. Hedefe (oyuncuya) ulaşıldığında yol geriye doğru izlenerek (`reverse`) optimize bir rota çıkartılır.

#### 3. Matematiksel ve Fonksiyonel Prosedürel Animasyon (Procedural Easing)
Geleneksel sprite animasyonlarındaki yüksek bellek tüketimini önlemek adına, animasyonlar zamana bağlı bir faz parametresine ($p \in [0, 1]$) göre matematiksel fonksiyonlarla hesaplanır:
* **Linear Interpolation (Lerp):** Karakterin konum ve ölçek geçişleri için:
  $$	ext{lerp}(a, b, t) = a + (b - a) * t$$
* **Cubic Easing Algoritmaları:** Yumruk, tekme veya Osmanlı tokadındaki ivmelenmeyi (vuruş öncesi gerilme ve ani darbe hissini) vermek için `easeIn`, `easeOut` ve `easeInOut` kübik fonksiyonları kullanılmıştır:
  $$	ext{easeIn}(t) = t^3$$
  $$	ext{easeOut}(t) = 1 - (1 - t)^3$$

---

## 4. Optimization & Memory Management

### Performance Bottlenecks (Performans Darboğazları ve Çözümler)
* **HTML5 Canvas Redraw Optimizasyonu:** Her render karesinde tüm haritanın piksellerini sıfırdan hesaplamak yerine, arka plan görseli tarayıcı belleğinde önbelleğe alınır (`preload sprites`). Sadece değişen nesneler, bounding box alanları hesaplanarak transformasyon matrisleri (`ctx.translate`, `ctx.rotate`, `ctx.scale`) aracılığıyla GPU ivmeli olarak çizilir.
* **Garbage Collection (Çöp Toplayıcı) Önlemleri:** Oyun döngüsü içerisinde sürekli yeni nesne (`{}`, `[]`) oluşturulması, JavaScript Garbage Collector'ı tetikleyerek mikrosaniyelik takılmalara (stuttering) yol açar. Bu projede, BFS algoritmasındaki `parents` ve `queue` yapıları oyunun başında **`Int32Array`** olarak tek seferde (allocation) rezerve edilmiştir ve döngü içinde yeniden yaratılmak yerine üzerlerine yazma (overwrite) yöntemi uygulanmıştır.

### Memory Management (Bellek Yönetimi)
* **32-Bit Smart Asset Pipeline:** Oyunda kullanılan tüm görsel asset'ler (`tellak_front`, `tellak_back`, `enemy_front`, `enemy_back`, `map`) yapay zeka entegrasyonuyla özgün olarak hamam temasına uygun üretilmiş, **32-bit derinlik (bit depth)** formatında optimize edilerek şeffaflık (Alpha kanalı) ve renk kalitesinden ödün vermeden belleğe enjekte edilmiştir.
* **Audio Asset Lazy Loading:** Ses dosyaları oyun yüklenirken tek bir seferde ön belleğe alınır, oyun esnasında dinamik olarak bellekten kaldırılıp tekrar yüklenmez, böylece disk I/O bloklamaları engellenir.

---

## 5. Version Control & Workflow

### Git Strategy
Proje geliştirme sürecinde **Feature Branch Workflow (Özellik Dalı İş Akışı)** stratejisi benimsenmiştir.
* `main` branch'i her zaman çalışan, hatasız ve stabil oyun sürümünü barındırmıştır.
* Her bir modül için ayrı branch'ler açılmıştır. Örnek: `feature/animation-engine`, `feature/ai-pathfinding`, `feature/audio-pipeline`.
* Geliştirilen özellikler lokalde test edildikten sonra `Pull Request (PR)` açılarak kod gözden geçirme (Code Review) sonrası ana branch'e entegre edilmiştir.

### Integration Challenges (Entegrasyon Zorlukları ve Çözümler)
En büyük entegrasyon zorluğu, `anim.js` içerisindeki prosedürel animasyon fazları ile `app.jsx` içerisindeki karakterlerin fiziksel koordinatlarının ve can azaltma tetikleyicilerinin senkronize edilmesi sırasında yaşanmıştır. 

* **Teknik Problem:** Animasyon kodları asenkron çalışırken, darbe anı (örneğin Osmanlı Tokadı'nın tam temas ettiği an, $p = 0.42$) yakalanamıyor, hasar çok erken veya çok geç işleniyordu.
* **Çözüm:** Animasyon yapısına özel bir `fx` tetikleme katmanı eklendi. `anim.js` içerisindeki saf fonksiyonlar, darbe anına ulaştığında Canvas döngüsüne özel bir bayrak (flag) fırlatır (`ko: 1`, `dust: 1`). `app.jsx` içindeki döngü bu bayrağı yakaladığı anda düşman dizisini (`enemiesRef.current`) tarayarak mesafe kontrolü yapar ve hasar algoritmasını (`damageGiven`) tam doğru karede tetikler. Bu sayede görsel bütünlük ve oyun hissiyatı (game feel) kusursuz hale getirilmiştir.