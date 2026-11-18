# Foco — empacotando como APK/AAB com Capacitor

## 1. Estrutura no disco

```
foco-app/
├── package.json          (criado pelo npm init)
├── capacitor.config.json (criado pelo cap init)
└── www/                  <- coloque os 5 arquivos AQUI
    ├── index.html
    ├── style.css
    ├── fonts.css         (fonte Montserrat embutida, licença OFL)
    ├── app.js
    └── storage.js
```

Os 5 arquivos devem ficar na mesma pasta (`www`). Não há dependências externas
(sem CDN, sem fontes remotas): o app funciona 100% offline.

## 2. Pré-requisitos

- Node.js 18+
- JDK 17+
- Android Studio (com Android SDK instalado)

## 3. Comandos

```bash
mkdir foco-app && cd foco-app
npm init -y
mkdir www            # copie index.html, style.css, app.js, storage.js para www/

npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init Foco com.exemplo.foco --web-dir=www
npx cap add android
npx cap sync android
npx cap open android   # abre no Android Studio
```

Sempre que alterar arquivos em `www/`, rode `npx cap sync android` de novo.

## 4. Gerar o APK / AAB

**Pelo Android Studio:** Build > Build Bundle(s) / APK(s) > Build APK(s) (debug)
ou Generate Signed Bundle / APK (release, .aab para a Play Store).

**Pela linha de comando:**

```bash
cd android
./gradlew assembleDebug     # APK: android/app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease     # AAB (exige keystore configurado)
```

## 5. Ajustes opcionais

- **Barra de status (roxa na tela inicial):** `npm i @capacitor/status-bar` e, no `app.js`,
  `StatusBar.setBackgroundColor({ color: '#b574e6' })` (e `setStyle({ style: Style.Dark })`).
  Nas telas internas o topo é branco; se quiser, troque a cor ao navegar.

- **Ícone e splash:** `npm i -D @capacitor/assets`, crie `assets/icon.png` (1024x1024)
  e `assets/splash.png` (2732x2732) e rode `npx capacitor-assets generate --android`.
- **Botão voltar do Android:** `npm i @capacitor/app` e, no `app.js`, use
  `App.addListener('backButton', ...)` para fechar sheets antes de sair do app.
- **Exportar backup:** em alguns WebViews o download de arquivo não funciona;
  nesse caso use o botão "Copiar" (área de transferência). Para salvar arquivos de
  forma nativa, adicione `@capacitor/filesystem` e `@capacitor/share`.
- **Notificação ao fim da sessão com o app fechado:** adicione
  `@capacitor/local-notifications` (o timer já usa horário de término, então o
  tempo continua correto ao reabrir o app).
