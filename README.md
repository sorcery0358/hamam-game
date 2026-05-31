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
*Tellak — Hamam Brawler* is a dynamic 2D top-down beat 'em up action game built with modern web technologies. Set in a traditional Turkish bath atmosphere, players knock out magandas using Ottoman slaps and kicks, and recover their health by drinking Turkey’s national beverage, **sodalı ayran**, when their energy is low.

### Core Mechanics
* **8-Way Movement:** The player moves freely across the bathhouse map using the `W`, `A`, `S`, and `D` keys. The character's facing direction updates instantly based on either the mouse position or the movement vector.
* **Attack Combos and Abilities:**
  * **Punch (`J`):** Deals 1 damage point and has a 1-second cooldown.
  * **Kick (`K`):** Deals 2 damage points and has a 2-second cooldown.
  * **Ottoman Slap (`L`):** Deals Area of Effect (AoE) damage, inflicting 3 damage points on all enemies within range. It has a 10-second cooldown and features a **25% chance for an instant kill (Instakill)**.
* **Health Regeneration (Sodalı Ayran - `B`):** When the player’s health (`HP`) is low, drinking "sodalı ayran" instantly refills the health bar completely. To prevent abuse of this mechanic, it has a 30-second cooldown.
* **Difficulty Scaling (Dynamic Spawning):** As the game progresses, the enemy spawn rate and wave intensity increase. As the player clears out enemies, their score (`Kill Count`) and total damage dealt are updated in real-time on the HUD.

### Win/Loss Conditions
* **Win Condition:** The game features an endless survival mode. The player's objective is to survive in the bathhouse for as long as possible and achieve the highest score by neutralizing the maximum number of magandas.
* **Loss Condition:** When the player’s health falls to zero (`PLAYER_MAX_HP = 10`), the game pauses, the `endofgame` sound effect triggers, and a "Game Over" panel appears on the screen.

---

## 2. Software Architecture

### High-Level Structure
The game is developed using a **Custom 2D HTML5 Canvas Game Engine** built on top of the **React (v18)** architecture, a modern web stack composition. To avoid the overhead of the Virtual DOM and ensure a smooth gameplay experience (60 FPS), the core engine and render loop are fully encapsulated using **React Hooks (`useRef`)** and optimized pure JavaScript functions.

* **UI Layer (React State):** Manages only the low-frequency interface elements that require infrequent updates, such as menu transitions, audio settings, and the HUD (Health bar, Cooldown indicators, Score).
* **Game Loop Layer (Direct DOM & Canvas Render):** Character, effect, and enemy logic states are updated in memory and rendered directly onto the Canvas using `requestAnimationFrame` or high-resolution, time-based `performance.now()` loops.

### Core Managers / Controllers
The game architecture is separated into the following subsystems via modular reference objects:
1. **Input Controller:** Asynchronously listens to keyboard inputs (WASD + JKLB) by maintaining a `Set` data structure named `arena.current.keys`. This prevents input loss during simultaneous key presses (e.g., throwing a punch while running diagonally).
2. **Animation Manager (`window.TELLAK`):** Located in the `anim.js` file, this module manages sprite-based animations using a **Mathematical Procedural Animation** engine instead of static frame-by-frame sheets.
3. **Audio Manager:** Asynchronously loads audio effects (`sounds.current`) from categorized folder structures. It dynamically controls audio files for background music (`background`), dealing damage (`damagegiven`), taking damage (`damagetaken`), drinking ayran (`drinkingayran`), game over (`endofgame`), and enemy death (`enemydeath`) using a linear volume equalization (`syncAudioVolumes`) algorithm.

### Design Patterns
* **Singleton Pattern / Namespace Isolation:** All animation and auxiliary mathematical libraries are wrapped inside an IIFE (Immediately Invoked Function Expression) as `(function () { ... })()` and attached to the global `window.TELLAK` object. This prevents global scope pollution.
* **State Pattern (State Machine):** The instantaneous states of characters and enemies (Running, Striking, Drinking Ayran, Taking Damage, Dying) are managed through state variables. For instance, while the player is in the `drink` state, movement inputs are locked.
* **Data-Driven Architecture:** Direction vectors and animation curves are maintained in static configuration objects (`DIRS`, `pose`). Instead of using hardcoded values within the code, these data tables are queried.

---

## 3. Algorithmic Implementation & Data Structures

### Data Structures
* **Navigation Grid (2D Flattened Grid Array):** To store the walkable areas of the bathhouse map, the `navGrid.current` structure utilizes an optimized **`Uint8Array`** composed of contiguous memory blocks instead of a traditional 2D matrix. Cell coordinates $(x, y)$ are mapped to a unique index using the following formula:
  $$\text{index} = y \times w + x$$
* **BFS Search Queue (Typed Array Queue):** In the AI pathfinding algorithm, a high-performance **Queue** data structure is implemented using a fixed-size **`Int32Array`** and two pointers (`head`, `tail`). This completely eliminates the $O(N)$ re-indexing overhead caused by JavaScript's built-in `Array.push/shift` functions.
* **Enemy Pool (Linear Dynamic Array):** All active enemy objects are stored in the `enemiesRef.current` array. This array is scanned during every frame to filter out and garbage-collect dead enemies from memory.

### Algorithms (Algorithms and Mathematical Models)

#### 1. Canvas-Based Spatial Masking
During the game loading phase, a mask image named `movinganddrinkingspaces.jpg` is drawn onto an offscreen canvas. The walkable (`ZONE_GREEN`) and restricted areas (`ZONE_PINK`) of the bathhouse are scanned using the RGB color distance formula (Manhattan Distance):
$$\text{Distance} = |R_{\text{pixel}} - R_{\text{zone}}| + |G_{\text{pixel}} - G_{\text{zone}}| + |B_{\text{pixel}} - B_{\text{zone}}|$$
Pixels falling below the specified tolerance threshold (`ZONE_TOL = 70`) are written into `zoneMask.current.cells` as `1` or `2`. Consequently, whenever the map design changes, physical boundaries can be updated simply by modifying the mask image without rewriting any code.

#### 2. AI Breadth-First Search (BFS) Pathfinding
To enable enemies (rowdy troublemakers/magandas) to intelligently pursue the player inside the bathhouse, a **Breadth-First Search (BFS)** algorithm executes within the `findNavPath` function.
* The map is partitioned into grid cells with a size of `NAV_CELL_SIZE = 18` pixels.
* Starting from the enemy's current cell, the algorithm scans the 4-directional neighborhood matrix (`[1, 0]`, `[-1, 0]`, `[0, 1]`, `[0, -1]`).
* The parent node histories of the visited cells are tracked in a `parents` array. Once the target (the player) is reached, the path is retraced (`reversed`) to generate an optimized route.

#### 3. Mathematical and Functional Procedural Animation (Procedural Easing)
To prevent the high memory consumption associated with traditional sprite sheets, animations are calculated mathematically based on a time-dependent phase parameter ($p \in [0, 1]$):
* **Linear Interpolation (Lerp):** Utilized for character position and scale transitions:
  $$\text{lerp}(a, b, t) = a + (b - a) * t$$
* **Cubic Easing Algorithms:** To deliver an organic sense of acceleration (the tension before a strike and the sudden impact) during punches, kicks, or Ottoman slaps, `easeIn`, `easeOut`, and `easeInOut` cubic functions are applied:
  $$\text{easeIn}(t) = t^3$$
  $$\text{easeOut}(t) = 1 - (1 - t)^3$$

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