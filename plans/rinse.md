# План: Rinse — Safari-расширение против рекламы для iPhone, iPad и Mac

**Дата:** 2026-10-24 · **Ветка:** `main` (новый репозиторий, по ветке на каждый шаг) · **Статус:** черновик
**Источник:** запрос пользователя: сделать «как Vinegar», но плюс блокировка рекламы во всём интернете, для iOS, iPadOS и macOS

## Проблема

На YouTube в Safari нельзя заблокировать рекламу сетевыми правилами: реклама приходит с тех же доменов, что и видео. PiP и фоновое воспроизведение на iPhone тоже не работают. На остальных сайтах нужен обычный блокировщик рекламы и трекеров. Существующие решения либо платные (Vinegar — только YouTube), либо закрывают только один из этих двух сценариев.

## Результат

Одно приложение из App Store, в нём два вида расширений для Safari на iPhone, iPad и Mac:

1. **YouTube.** Плеер YouTube остаётся, но из него вырезана реклама. Добавлены системный PiP и (если подтвердится ручной проверкой) фоновый звук. *Изначально планировался свой `<video>`, но spike показал, что это невозможно — см. шаг 1.*
2. **Весь интернет.** Content Blocker'ы режут рекламу, трекеры и рекламные блоки на страницах, при этом расширение не получает доступа к содержимому сайтов.

## Критерии успеха

- [ ] На iPhone (m.youtube.com), iPad и Mac (www.youtube.com) обычное видео стартует в плеере Rinse без pre-roll и mid-roll рекламы. Проверка: 20 случайных видео на каждой платформе, ≥ 18 из 20 играют.
- [ ] PiP запускается из плеера Rinse на всех трёх платформах.
- [ ] Если видео не удалось получить, через ≤ 5 с возвращается родной плеер YouTube и показывается плашка. Пустой или чёрный экран недопустим.
- [ ] Переход между видео внутри YouTube (SPA-навигация) работает без перезагрузки страницы, а `?t=` и `&t=` учитываются.
- [ ] Тест [d3ward adblock test](https://d3ward.github.io/toolz/adblock.html) ≥ 90% в Safari на iPhone и Mac при включённых блокерах.
- [ ] Все блокеры компилируются Safari без ошибок; перезагрузка всех правил на iPhone занимает ≤ 10 с.
- [ ] Для Content Blocker'ов не нужно разрешение «Доступ ко всем сайтам». Веб-расширение просит доступ только к `youtube.com`.
- [ ] Приложение принято в App Store (или хотя бы во внешний TestFlight-бета-тест).

## Не делаем

- **Рекламу в нативном приложении YouTube.** Это технически невозможно без VPN или MITM.
- **DNS- или VPN-блокировку на уровне системы** (NEPacketTunnel, DNS Settings). Это отдельный продукт с отдельным ревью.
- **Shorts, прямые трансляции, премьеры и видео 18+, требующие входа.** Для них остаётся родной плеер.
- **Скачивание видео.** Нарушает правила App Store и сразу ведёт к отказу.
- **SponsorBlock и пропуск интеграций внутри видео.** Отложено.
- **Другие браузеры** (Chrome и Firefox на iOS не поддерживают расширения) и Android.
- **Скриптлеты и процедурные косметические фильтры** (`##+js`, `:has-text`, `$redirect`). В MVP только то, что выражается в формате Content Blocker JSON.

## Что уже есть

Проект пустой: `~/dev/rinse` с `git init` и пустыми `extension/` и `extension/icons/`. Своего кода и соглашений нет, поэтому опираемся на шаблоны Apple:

- Xcode 27.1, macOS 27.0.1, симуляторы iOS 27.0 и 27.1. Установлены `xcodegen` (`/opt/homebrew/bin/xcodegen`) и `xcrun safari-web-extension-converter`.
- **Важная деталь про iPad.** Safari на iPad по умолчанию открывает десктопную версию сайта (`www.youtube.com`, десктопный UA). Значит, путь получения видео для iPad совпадает с Mac, а не с iPhone.
- Есть подписка Apple Developer: можно использовать App Groups, TestFlight и App Store.

## Архитектура

**Выбрано: одно приложение-контейнер на SwiftUI, одно Safari Web Extension только для YouTube и четыре Content Blocker extension для всего интернета. Проект описан в XcodeGen (`project.yml`), все таргеты мультиплатформенные (iOS и macOS).**

```
Rinse.app (SwiftUI; iOS/iPadOS и macOS)
├── RinseYouTube.appex        Safari Web Extension: content script на *.youtube.com
│     content.js  → внедряет page.js в мир страницы
│     page.js     → вырезает рекламу из player response, включает PiP и фон
│     popup       → «выключить на этом сайте», статус
│     SafariWebExtensionHandler.swift → native messaging → App Group
├── RinseAds.appex            Content Blocker: EasyList (сетевые правила)
├── RinsePrivacy.appex        Content Blocker: EasyPrivacy
├── RinseCosmetic.appex       Content Blocker: EasyList (скрытие элементов, css-display-none)
├── RinseAnnoyances.appex     Content Blocker: cookie-баннеры и прочее (по умолчанию выключен)
└── App Group  group.<team>.rinse   settings.json, allowlist.json
tools/FilterCompiler (SwiftPM CLI)  ABP/EasyList → Safari content-blocker JSON (на этапе сборки)
filters/sources.json                URL, лицензии и закреплённые версии списков
```

**Почему так, а не иначе:**

| Подход | Как работает | Компромисс | Решение |
|---|---|---|---|
| A. Content Blocker'ы для всего веба + Web Extension только для YouTube (выбрано) | Safari сам применяет JSON-правила; JS работает только на youtube.com | Каждый блокер ограничен (~150k правил), поэтому нужно 4 таргета. Списки обновляются вместе с приложением | ✅ Лучшая приватность и производительность, никаких страшных разрешений. Самый проверенный путь в App Review (так сделаны AdGuard и 1Blocker) |
| B. Всё в одном Web Extension через `declarativeNetRequest` | DNR-правила и content script на `<all_urls>` | Пользователь должен дать «доступ ко всем сайтам». Лимиты DNR в Safari меньше. Косметику придётся делать JS на каждой странице | ❌ Неудобно для пользователя и сложнее пройти ревью |
| C. Готовая библиотека AdGuard SafariConverterLib для конвертации | Подключаем Swift-пакет | Лицензия GPL-3.0 плохо совместима с App Store, ради одной функции тянем большую зависимость | ❌ Пишем свой компилятор под нужное подмножество синтаксиса |

**Генерация проекта: XcodeGen, а не `safari-web-extension-converter`.** Конвертер создаёт WebView-приложение и `.pbxproj`, в который неудобно добавлять ещё четыре таргета блокеров и App Group, а его диффы нечитаемы в ревью. `project.yml` даёт детерминированную генерацию, и его легко править.

**Что заставит пересмотреть решение:** ~~получить поток самим~~ — пересмотрено по spike, теперь вырезаем рекламу из плеера YouTube. Следующая точка пересмотра — если YouTube начнёт вшивать рекламу в сам поток (SSAI). Тогда придётся детектировать рекламный отрезок и перематывать его.

**Затрагивает:**
- Данные: `settings.json` и `allowlist.json` в App Group, без миграций.
- API: native messaging (`browser.runtime.sendNativeMessage`) с командами `getSettings`, `toggleSite`, `reloadBlockers`.
- Зависимости: XcodeGen (уже стоит). Внешних SDK нет.
- Минимальные версии (допущение): iOS/iPadOS 18, macOS 15.

## Шаги

Упорядочены по риску. После каждого шага приложение собирается и работает.

### 1. Spike: где брать поток YouTube на каждой платформе — M · `[x]`

> **Итог (2026-10-24, [docs/spikes/youtube-streams.md](../docs/spikes/youtube-streams.md)):** HLS не отдаётся ни одному клиенту, прямые ссылки без PO-токена обрываются на ~12–16 МБ (403). Свой `<video>` нежизнеспособен. Переходим на «вырезание рекламы из плеера YouTube», шаги 6–7 переписаны. Ручная проверка тестового расширения в Safari (PiP, фон, нет ли рекламы) ещё открыта.


- **Почему первым:** от этого зависит, жизнеспособна половина продукта или нет, и какие платформы входят в MVP.
- **Файлы:** `spikes/youtube-stream/content.js`, `spikes/youtube-stream/manifest.json` (временные), `docs/spikes/youtube-streams.md` (новый, результат).
- **Что делает:** временное расширение логирует, что доступно для одного и того же набора из 20 видео. Проверяется: (a) `ytInitialPlayerResponse.streamingData.hlsManifestUrl`; (b) `formats[].url` без `signatureCipher`; (c) запрос `POST /youtubei/v1/player` со страницы с клиентами `MWEB`, `IOS`, `TVHTML5_SIMPLY_EMBEDDED_PLAYER`; (d) воспроизводится ли полученный URL в `<video>`, и не получаем ли через ~60 с троттлинг или 403. Отдельно проверяется, играет ли звук `<video>` при заблокированном экране iPhone и через `navigator.mediaSession`.
- **Проверка:** таблица «платформа × источник × успех из 20 × троттлинг» в `docs/spikes/youtube-streams.md`. На Mac загружается через Safari → Develop → Add Temporary Extension, на iPhone и iPad — через Xcode-сборку из шага 3 (или через конвертер разово).
- **Зависит от:** —

### 2. Spike: лимиты и скорость Content Blocker на устройстве — S · `[~]`

> **Частично (2026-10-24):** реальные списки дали 75,7k / 56,3k / 11k правил; `WKContentRuleListStore` на Mac компилирует их за 1,9 / 1,2 / 0,7 с без ошибок. Лимит 150k не упирались. Время на iPhone не замерено (приложение показывает ошибки перезагрузки блокеров).


- **Почему вторым:** число блокеров и разбиение списков зависят от реального лимита правил на текущих iOS 27 и macOS 27.
- **Файлы:** `spikes/blocker-limit/gen.py` (генератор N правил), `docs/spikes/blocker-limits.md`.
- **Что делает:** собирает один блокер с 50k, 150k и 300k правил и вызывает `SFContentBlockerManager.reloadContentBlocker`. Фиксирует ошибки и время на iPhone и Mac.
- **Проверка:** зафиксирован максимальный N без ошибки и время компиляции. Шаг 5 опирается на эти цифры.
- **Зависит от:** — (*можно параллельно с шагом 1*)

### 3. Скелет проекта на XcodeGen — M · `[x]`

> **Итог (2026-10-24):** `project.yml` → `Rinse_iOS`/`Rinse_macOS` + `RinseYouTube` + `RinseAds`, команда S37Z4QU5FT, bundle `com.nikolaikushner.rinse`. Обе сборки подписаны и собираются, на Mac расширения зарегистрированы. YouTube-расширение взято из spike, блокер — стартовый список на 78 правил (`scripts/starter-blocklist.py`). App Group и `Config/Signing.xcconfig` пока не нужны — отложено до шага 8.


- **Файлы:** `project.yml`, `App/RinseApp.swift`, `App/ContentView.swift` (заглушка), `Extensions/YouTube/{manifest.json,content.js,page.js}`, `Extensions/YouTube/SafariWebExtensionHandler.swift`, `Extensions/Blockers/Ads/{ContentBlockerRequestHandler.swift,blockerList.json}`, `Shared/AppGroup.swift`, `*.entitlements`, `.gitignore`, `README.md`, `CLAUDE.md` (как собирать и проверять).
- **Что делает:** мультиплатформенное приложение, одно веб-расширение (пока пустое: `console.log`) и один блокер с тремя тестовыми правилами, общий App Group, `DEVELOPMENT_TEAM` вынесен в `Config/Signing.xcconfig` (в `.gitignore`, есть пример `Signing.example.xcconfig`).
- **Проверка:** `xcodegen && xcodebuild -scheme Rinse -destination 'generic/platform=iOS Simulator' build` и то же для `platform=macOS`. Оба расширения появляются в настройках Safari на симуляторе и на Mac, тестовое правило блокирует `example.com/ads.js`.
- **Зависит от:** —

### 4. Компилятор фильтров (сетевые правила) — M · `[x]`

> **Итог (2026-10-24):** сделан на Python (`tools/filters/compile.py`), а не на Swift: он нужен только при сборке, а перенос на устройство отложен вместе с обновлением списков без релиза. 23 unit-теста (`python3 -m unittest discover -s tools/filters`), проверка WebKit (`tools/filters/validate.swift`), отбраковка невалидных селекторов (`tools/filters/check-selectors.swift` → `filters/invalid-selectors.txt`). Домены `site.*` в косметике переводятся в url-filter страницы.


- **Файлы:** `tools/FilterCompiler/Package.swift`, `Sources/FilterCompiler/{Parser.swift,NetworkRule.swift,SafariEmitter.swift,main.swift}`, `Tests/FilterCompilerTests/NetworkRuleTests.swift`, `filters/sources.json`, `scripts/update-filters.sh`.
- **Что делает:** разбирает `||domain^`, `|https://`, `*`, `^`, `@@` исключения, `$third-party`, `$domain=`, `$script/$image/$stylesheet/$font/$media/$xmlhttprequest/$subdocument`. Выдаёт Safari JSON (`url-filter` в урезанном regex Safari, `if-domain`/`unless-domain`, `load-type`, `resource-type`, `ignore-previous-rules` для исключений). Неподдерживаемые правила пропускаются со счётчиком в отчёте. Правило дробится, если в нём больше одного домена.
- **Проверка:** `swift test --package-path tools/FilterCompiler` с фикстурами «строка фильтра → ожидаемый JSON» (≥ 30 кейсов, включая исключения и `$domain=~`). `scripts/update-filters.sh` печатает «принято / пропущено» по каждому списку.
- **Зависит от:** 2 (лимиты). *Можно параллельно с шагами 6–7.*

### 5. Четыре блокера на реальных списках — M · `[~]`

> **Сделано три из четырёх (2026-10-24):** Ads (EasyList + RU AdList + `filters/rinse.txt`, сеть), Privacy (EasyPrivacy), Page Cleaner (косметика всех списков). Annoyances не делали. d3ward-тест и регрессия на 10 сайтах ещё не проводились. Известное ограничение: CSS-инъекции и скриптлеты (казино-брендинг фоном `body` на HDrezka, VAST в плеере) Content Blocker'ом не убрать — это задача для веб-расширения на `<all_urls>` (в «Отложено»).


- **Файлы:** `Extensions/Blockers/{Ads,Privacy,Cosmetic,Annoyances}/…`, `project.yml` (ещё 3 таргета), `Sources/FilterCompiler/CosmeticRule.swift` (`##sel`, `domain##sel`, `#@#` → `css-display-none`), `Tests/FilterCompilerTests/CosmeticRuleTests.swift`.
- **Что делает:** скомпилированные EasyList, EasyPrivacy и Fanboy Annoyances раскладываются по блокерам в пределах лимита из шага 2. Generic-селекторы объединяются пачками по ~50 в одно правило, чтобы экономить лимит.
- **Проверка:** на iPhone и Mac в Safari все 4 блокера включаются без ошибок (`SFContentBlockerManager.getStateOfContentBlocker`), d3ward ≥ 90%. Ручная регрессия на 10 популярных сайтах (новости, магазины, gmail, банк) не выявляет сломанной вёрстки.
- **Зависит от:** 3, 4.

### 6. Вырезание рекламы из плеера YouTube — M · `[ ]`

*(Переписан по итогам spike: свой `<video>` невозможен без PO-токенов.)*

- **Файлы:** `Extensions/YouTube/content.js` (внедряет `page.js` и переписывает inline-скрипт с `ytInitialPlayerResponse` через MutationObserver — какой механизм работает, решит ручная проверка spike), `Extensions/YouTube/page.js` (`prune()`, хуки на `ytInitialPlayerResponse`, `fetch`, `XMLHttpRequest` для `/youtubei/v1/(player|next|get_midroll_info)`), `Extensions/YouTube/rinse.css` (`ytd-ad-slot-renderer`, `ytd-in-feed-ad-layout-renderer`, masthead, попап «Ad blockers are not allowed»). Основа — `spikes/youtube-stream/extension/`.
- **Что делает:** удаляет `adPlacements`, `adSlots`, `playerAds`, `adBreakHeartbeatParams` из ответов плеера на www и m. Скрывает рекламные карточки в ленте. Добавляет страховку: если реклама всё же началась (класс `ad-showing` на `#movie_player`), глушит её и перематывает в конец.
- **Проверка:** ручной чек-лист из 20 видео × 3 платформы (критерии успеха 1, 4), `docs/qa/youtube-checklist.md` (новый), логи `[rinse]` в Web Inspector.
- **Зависит от:** 1 (ручная проверка), 3. *Можно параллельно с шагами 4–5.*

### 7. PiP, фоновое воспроизведение, устойчивость — M · `[ ]`

- **Файлы:** `page.js` (`enablePip()` через `webkitSetPresentationMode`, удаление `disablePictureInPicture`; `keepAlive()` — подмена `document.hidden`/`visibilityState`, глушение `visibilitychange`/`pagehide`; `navigator.mediaSession` с названием и обложкой), `popup` или кнопка PiP в интерфейсе плеера, `manifest.json` (`youtube-nocookie.com`, встроенные `/embed/` в iframe на других сайтах).
- **Что делает:** PiP и фоновое воспроизведение поверх плеера YouTube. Обрабатывает встроенные плееры. Добавляет флаг `debug` в настройках.
- **Проверка:** чек-лист шага 6 плюс PiP на iPhone, iPad и Mac, звук при заблокированном экране iPhone, встроенное видео на стороннем сайте.
- **Зависит от:** 6.

### 8. Allowlist и popup расширения — M · `[ ]`

- **Файлы:** `Extensions/YouTube/popup.{html,js,css}` (кнопка «Пауза на этом сайте» видна на любом сайте, если пользователь дал доступ, иначе только на YouTube), `SafariWebExtensionHandler.swift` (`toggleSite`), `Shared/Allowlist.swift`, `Extensions/Blockers/*/ContentBlockerRequestHandler.swift` (добавляет в конец правило `ignore-previous-rules` с `if-domain` из allowlist).
- **Что делает:** сайт можно выключить из popup или из приложения. Блокеры перезагружаются через `SFContentBlockerManager.reloadContentBlocker`.
- **Проверка:** добавили сайт → после перезагрузки страницы реклама появилась, убрали → пропала. Unit-тест `AllowlistTests` (сериализация и сборка правила).
- **Зависит от:** 5.

### 9. Приложение на SwiftUI — M · `[ ]`

- **Файлы:** `App/Onboarding/{OnboardingView.swift,EnableStepsView.swift}`, `App/Status/StatusView.swift`, `App/Settings/{ListsView.swift,AllowlistView.swift,YouTubeSettingsView.swift}`, `Shared/Settings.swift`.
- **Что делает:** онбординг с инструкцией включения. На iOS и iPadOS это «Настройки → Приложения → Safari → Расширения», на macOS — кнопка `SFSafariApplication.showPreferencesForExtension`. Экран статуса показывает, какой блокер и расширение включены. Есть переключатели списков, редактор allowlist и настройки YouTube (автоплей, скорость по умолчанию). Раскладка адаптивная: iPhone, iPad (`NavigationSplitView`), Mac.
- **Проверка:** SwiftUI Previews на трёх размерах, `xcodebuild test -scheme Rinse` (тесты `Settings`/`Allowlist`), ручной прогон онбординга на симуляторе iPhone и iPad и на Mac.
- **Зависит от:** 3 (после 8 — для allowlist). *Можно начинать параллельно с 5–7.*

### 10. Готовность к App Store — S · `[ ]`

- **Файлы:** `App/Assets.xcassets/AppIcon`, `extension/icons/*` → `Extensions/YouTube/icons/*`, `App/PrivacyInfo.xcprivacy`, `docs/appstore/{description.ru.md,description.en.md,review-notes.md}`, `LICENSES.md` (EasyList и Fanboy — CC BY-SA 3.0, с атрибуцией).
- **Что делает:** иконки, privacy manifest (данные не собираются), тексты, заметки для ревью. Формулировка — «альтернативный плеер и блокировщик контента», а не «обход рекламы YouTube». Затем архив и загрузка в TestFlight.
- **Проверка:** `xcodebuild archive` для iOS и macOS проходит, билд принят в App Store Connect, внутренний TestFlight ставится на iPhone, iPad и Mac.
- **Зависит от:** 5–9.

## Риски

| Риск | Ранний сигнал | Как дёшево проверить сейчас |
|---|---|---|
| ~~YouTube не отдаёт поток без PO-токена~~ — подтвердилось, обойдено сменой подхода | — | См. шаг 1 |
| YouTube вшивает рекламу в поток (SSAI) или детектирует подмену ответа | Реклама при бейдже `pruned > 0`, попап anti-adblock | Страховка «заглушить и перемотать» в шаге 6; следить за фильтрами uBO `youtube.com##+js(json-prune…)` как за индикатором |
| YouTube меняет страницу или API, и плеер ломается после релиза | Рост плашек «не смог загрузить» у себя, отзывы | Фоллбек на родной плеер (никогда не чёрный экран); шаги 6–7 изолируют логику в `pickSource()` для быстрых правок |
| Фоновое воспроизведение на iPhone не работает для `<video>` в Safari | Spike: звук пропадает при блокировке | Шаг 1. Если нет — честно убрать из описания и оставить PiP |
| Отказ в App Review из-за блокировки рекламы YouTube | Rejection по 5.2.2 / 2.5 | Аналоги (Vinegar) в App Store есть. Формулировки в `review-notes.md`, без слов «YouTube» в названии и иконке |
| Лимит правил ниже ожидаемого / медленная компиляция на iPhone | Spike 2: ошибка `WKErrorDomain` при N < 150k | Шаг 2. Больше блокеров, агрессивнее отбрасывать редкие правила |
| Лицензии списков фильтров | Списки под GPL | Использовать только списки под CC BY-SA / public domain, атрибуция в `LICENSES.md` |
| Сломанная вёрстка сайтов из-за косметики | Жалобы, визуальная регрессия | Allowlist (шаг 8), ручная регрессия на 10 сайтах в шаге 5 |

## Откат

Необратимых частей нет: миграций и сервера нет. Плохой список фильтров откатывается выпуском следующей версии с прежним `filters/sources.json` (версии закреплены). Плохой релиз — выключить выдачу в App Store Connect или выпустить hotfix. Плеер на YouTube можно выключить флагом в настройках приложения (`youtubePlayerEnabled`).

## План тестирования

- **Unit:** `tools/FilterCompiler` (`swift test`), `Settings`/`Allowlist` (`xcodebuild test -scheme Rinse`).
- **Интеграционно:** сборка iOS и macOS через `xcodebuild`, загрузка блокеров без ошибок (`getStateOfContentBlocker`).
- **Ручное e2e:** `docs/qa/youtube-checklist.md` (20 видео × iPhone, iPad, Mac), d3ward adblock test, 10 сайтов на регрессию вёрстки.
- **CI:** пока нет. Позже — GitHub Actions на macOS-раннере: `xcodegen`, `xcodebuild build`, `swift test`.
- **Сознательно не тестируем автоматически:** реальное воспроизведение YouTube. Нужен живой Safari и сеть, а автоматизация Safari расширений на iOS ненадёжна. Покрывается чек-листом.

## Выпуск

Внутренний TestFlight (свои устройства) → внешний TestFlight на 10–20 человек на 2 недели → App Store. Списки фильтров на старте обновляются только с релизами приложения. Признак успеха в проде — отзывы и самопроверка по чек-листу раз в неделю (YouTube ломает чаще, чем мы релизим). Аналитику не собираем: это часть позиционирования.

## Открытые вопросы

- [ ] **Финальное имя.** «Rinse» (AdZero занят в App Store). Решает пользователь, блокирует шаг 10.
- [ ] **Bundle ID и Team ID** (например, `com.<you>.rinse`). Решает пользователь, блокирует шаг 3.
- [ ] **Модель монетизации:** бесплатно, разовая покупка (как Vinegar) или подписка. Решает пользователь, блокирует шаг 10.
- [ ] **Минимальные версии ОС.** Допущение: iOS 18 / macOS 15. Блокирует шаг 3.

## Отложено

- Обновление списков фильтров на устройстве без релиза (BGAppRefreshTask и компиляция в приложении — компилятор из шага 4 уже переиспользуемый).
- SponsorBlock, выбор качества вручную, ускорение > 2×, запоминание позиции просмотра.
- Скриптлеты и процедурная косметика через веб-расширение на `<all_urls>` (по опции).
- Плеер для Shorts.
- Пользовательские правила фильтров в приложении.
- Синхронизация настроек между устройствами через iCloud.
