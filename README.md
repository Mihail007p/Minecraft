# Minecraft + NITRO RUSH

В репозитории две игры, обе работают в браузере без интернета.

## 🏁 NITRO RUSH — уличные гонки (Android)

Аркадные гонки в духе Asphalt: карьера из 5 серий, дрифт и нитро, 6 трасс,
12 машин с тюнингом. Полностью офлайн, есть Android-обёртка для сборки APK.

* **Играть сразу**: [race/index.html](race/index.html)
* **На телефон без установки**: скачайте `dist/NITRO RUSH.html` — это один
  самодостаточный файл, открывается в Chrome и работает без сети.
* **APK**: workflow **Build NITRO RUSH APK** (вкладка Actions) собирает
  `app-debug.apk` и подписанный `app-release.apk`.
* Подробности, управление и сборка: [race/README.md](race/README.md) и
  [README-ANDROID.md](README-ANDROID.md).

## ⛏ Minecraft (браузер)

Простой воксельный мир: [game/index.html](game/index.html) —
WASD для ходьбы, ЛКМ ломать, ПКМ ставить, 1–7 выбирать блок.

## Сборка и тесты

```bash
node tools/build-offline.js        # собрать одиночный html для телефона
node tools/test-sim.js             # физика, ИИ, трассы, карьера (162 проверки)
node tools/test-scene.js           # целостность 3D-сцен (85 проверок)
node tools/test-ui.js              # прогон приложения в jsdom (73 проверки)
```
