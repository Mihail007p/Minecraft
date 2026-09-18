# NITRO RUSH — Android

Проект-обёртка: игра целиком лежит в `app/src/main/assets/nitrorush.html`
(генерируется скриптом `node tools/build-offline.js --android`).

## Сборка APK локально

```bash
node tools/build-offline.js --android     # собрать offline-версию игры
cd android
gradle assembleDebug                      # нужен JDK 17 и Android SDK 34
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## Готовый APK без сборки

Откройте страницу релизов репозитория (GitHub → Releases → последний релиз
`NITRO RUSH`) и скачайте оттуда:

* `app-release.apk` — приложение для телефона (подписан, ставится поверх);
* `app-debug.apk` — отладочная сборка, если первая почему-то не ставится;
* `nitro-rush.html` — та же игра одним файлом, открывается в Chrome без установки.

Установка на телефон: скачать APK, разрешить установку из неизвестных
источников, открыть файл. Интернет не нужен — игра работает офлайн.

## Сборка на GitHub Actions

Workflow «Build NITRO RUSH APK» собирается на каждый push: запускает тесты,
затем `gradle assembleDebug assembleRelease` и публикует результат
(раздел Actions → нужный запуск → Artifacts → `nitro-rush-apk`).
Тег вида `nitro-rush-v*` дополнительно создаёт релиз с APK и html.

Если Actions отключены: Settings → Actions → General → Allow all actions.
