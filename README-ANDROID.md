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

## Сборка на GitHub Actions

Workflow «Build NITRO RUSH APK» собирает APK и прикладывает его к запуску
(раздел Actions → нужный запуск → Artifacts → `nitro-rush-debug-apk`).
Требуется включить Actions в настройках репозитория (Settings → Actions →
General → Allow all actions).

Установка на телефон: скачать APK, разрешить установку из неизвестных
источников, открыть файл.
