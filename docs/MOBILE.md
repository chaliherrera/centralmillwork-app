# Mobile — Central Millwork

App móvil para registrar recepciones de OCs en sitio. Construida con Expo (React Native).

---

## TL;DR

App standalone para iOS y Android, hecha con Expo SDK 54. Comparte backend con la web pero replica solo el flujo de recepción (no es un wrapper del SPA web). El usuario en campo escanea/abre la OC, marca materiales recibidos, toma fotos con la cámara, y registra la recepción — todo offline-tolerant en lo que pueda y syncing inmediato cuando hay red.

**Estado actual de distribución**: el equipo la usa vía **Expo Go + tunnel** (depende de la PC del dev encendida con `npx expo start --tunnel`). Para distribución real conviene migrar a EAS Build (binario standalone que no necesita la PC).

---

## Stack y arquitectura

### Stack

| Capa | Lib | Versión |
|---|---|---|
| Runtime | Expo | SDK 54 |
| Framework | React Native | 0.81 |
| Lenguaje | TypeScript | 5.9 |
| Navegación | @react-navigation/native + native-stack | 7.x |
| Server state | TanStack Query | 5.100 |
| HTTP | Axios | 1.15 |
| Cámara/imágenes | expo-image-picker | 17.0 |
| Storage seguro | expo-secure-store | 15.0 |
| File system | expo-file-system | 19.0 |
| OTA Updates | expo-updates | 29.0 |

### Arquitectura

```
┌──────────────────────────────────┐
│ User dispositivo (iPhone/Android)│
│                                  │
│  ┌───────────────┐               │
│  │ Expo Go       │  (dev)        │
│  │   o           │  (prod)       │
│  │ EAS standalone│               │
│  └───────┬───────┘               │
└──────────┼───────────────────────┘
           │
           │ JS bundle (+ assets)
           │
   ┌───────┴────────┐
   │                │
   │ Dev:           │
   │ tu PC con      │
   │ Metro server   │
   │ (vía tunnel)   │
   │                │
   │ Prod:          │
   │ Expo CDN +     │
   │ OTA updates    │
   └───────┬────────┘
           │
           │ HTTPS direct (no proxy)
           │
           ▼
  ┌─────────────────────┐
  │ centralmillwork-    │
  │ backend service     │
  │ (Railway)           │
  │                     │
  │ misma API REST      │
  │ que usa el web SPA  │
  └─────────────────────┘
```

> El mobile pega **directo** al backend service, sin pasar por el frontend service. La URL está hardcodeada en `mobile/src/services/api.ts` línea 4.

### Estructura de archivos

```
mobile/
├── package.json
├── app.json              # config Expo (icons, splash, bundleId, EAS projectId, OTA URL)
├── App.tsx               # entry: AuthProvider + NavigationContainer + stack
├── index.ts              # registro del root component
├── tsconfig.json
├── assets/
│   ├── icon.png          # icon principal (todos los OS)
│   ├── adaptive-icon.png # adaptive icon Android
│   ├── splash-icon.png   # splash screen
│   └── favicon.png
├── .expo/                # cache de Expo (gitignored)
├── dist/                 # build output (gitignored)
└── src/
    ├── context/
    │   └── AuthContext.tsx    # state global de auth (token + user)
    ├── services/
    │   ├── api.ts             # axios instance + tokenStorage/userStorage
    │   ├── ordenesCompra.ts   # endpoints de OCs
    │   ├── recepciones.ts     # endpoints de recepción + historial
    │   └── imagenes.ts        # upload de fotos a Supabase
    ├── components/
    │   └── EtaBadge.tsx       # badge de "VENCE EN Nd" / "VENCIDO"
    ├── screens/
    │   ├── LoginScreen.tsx
    │   ├── HomeScreen.tsx
    │   ├── OCsListScreen.tsx
    │   └── OCDetailScreen.tsx # corazón de la app: registrar recepción
    └── types/
        └── index.ts
```

### Flujo de pantallas

```
LoginScreen
   └─ login OK → tokenStorage.save → setUser(...) → 
       ↓
HomeScreen
   └─ "Ver OCs Pendientes" →
       ↓
OCsListScreen (lista de OCs ordenadas o en tránsito)
   └─ tap en una OC →
       ↓
OCDetailScreen (registro de recepción)
   └─ "Registrar Recepción TOTAL/PARCIAL" → POST → vuelve a OCsListScreen
```

### Diferencias notables del web

| Tema | Web | Mobile |
|---|---|---|
| Token storage | `localStorage` (`cm_token`) | `expo-secure-store` (Keychain/Keystore — más seguro) |
| URL del backend | Configurable via `VITE_BACKEND_URL` (build-time) | **Hardcodeada** en `services/api.ts` (producción Railway directamente) |
| Quién recibió | Input manual en el form | Tomado del `user.nombre` del JWT logueado |
| Subida de imágenes | Drag & drop o file picker | `expo-image-picker` con cámara nativa |
| Operaciones disponibles | CRUD completo | Solo flujo de recepciones (subset) |

---

## Setup para desarrollo

### Prerrequisitos
- Node.js ≥ 20 (recomendado 22)
- App **Expo Go** instalada en el dispositivo físico (App Store / Play Store)
  - O un emulador (Xcode iOS Simulator / Android Studio AVD)

### Primer setup

```bash
cd mobile
npm install
```

`mobile/` es un workspace independiente — su `node_modules` está en `mobile/node_modules`, no comparte con el root.

### Variables de entorno

**No hay `.env`**. La URL del backend está hardcodeada en `src/services/api.ts`:

```ts
const API_URL = 'https://centralmillwork-backend-production.up.railway.app/api'
```

Para cambiar a backend local, editar manualmente esa línea (con la IP local del PC, no `localhost` porque el dispositivo no la resolvería).

> **Pendiente**: mover a `expo-constants` con valores en `app.json.extra` para evitar editar código fuente al cambiar entorno.

### Levantar dev (modo tunnel — recomendado)

```bash
cd mobile
npx expo start --tunnel
```

`--tunnel` rutea las requests del dispositivo via Internet (servers de Expo) en lugar de la red local. Funciona aunque el celular esté en otra WiFi o en cellular.

> La primera vez te pide instalar `@expo/ngrok` — decir Y.

Verás un QR code en la terminal:
- **iOS**: abrí la app **Cámara**, apuntá al QR, tap en la notificación que sale → abre Expo Go con el bundle
- **Android**: abrí Expo Go directo, tap "Scan QR Code", apuntá al QR

Después de la primera carga, la app queda en "Recently opened" en Expo Go para abrir más rápido.

### Levantar dev (modo LAN — si funciona)

```bash
cd mobile
npx expo start
```

Sin `--tunnel`. Más rápido pero **solo funciona si el dispositivo y la PC están en la misma red WiFi y el firewall lo permite**. Si el dispositivo no se conecta, cambiar a tunnel.

### Comandos útiles del Metro bundler

Una vez arrancado, en la terminal de Metro:

| Tecla | Acción |
|---|---|
| `r` | Reload — fuerza al cliente a recargar el bundle (útil después de cambios) |
| `m` | Toggle developer menu en el cliente |
| `j` | Open debugger (Chrome DevTools para JS) |
| `o` | Open project en VSCode (o tu editor configurado) |
| `s` | Switch entre Expo Go y Development Build |
| `?` | Show all commands |

### Hot Reload

Por default está habilitado: cualquier cambio en archivos `.tsx`/`.ts` se reflejan inmediatamente en el dispositivo sin necesidad de reload manual. Para forzar reload, agitar el dispositivo → menu → Reload, o en terminal apretar `r`.

### Limpiar cache (si Metro queda raro)

```bash
npx expo start --tunnel -c
```

El flag `-c` borra el cache del bundler. Necesario cuando:
- Instalaste/eliminaste deps
- Cambios no se reflejan en el cliente aunque hagas reload
- Errores de "cannot find module" después de cambios

---

## Setup para producción (EAS Build)

EAS = Expo Application Services. Permite buildear binarios standalone (`.apk` / `.ipa`) que **no dependen de tu PC ni de Expo Go** — los users abren la app directamente como cualquier app del store.

El proyecto ya tiene **EAS configurado** (`app.json` → `extra.eas.projectId`):
```
"projectId": "c51c210a-f0d2-482a-b420-a2aa0b626221"
```

### Setup inicial (solo una vez por dev)

```bash
npm install -g eas-cli
eas login    # con tu cuenta de Expo (chaliherrera)
```

### Build de Android (APK)

```bash
cd mobile
eas build --platform android --profile preview
```

Sin `eas.json` configurado, va a preguntar para crearlo automáticamente. El `--profile preview` genera un APK distribuible (instalable directo, no necesita Play Store).

Tiempo: ~10-15 min en cola + build. Cuando termina, te da una URL para descargar el APK.

**Distribuir el APK**:
- Enviar URL al equipo por WhatsApp/email
- En Android: descargar, abrir el archivo, dar permiso "Install from unknown sources" en Settings, instalar
- Funciona offline una vez instalada (excepto las requests al backend obviamente)

### Build de iOS (IPA / TestFlight)

iOS es más restrictivo. Para distribución sin App Store:

```bash
cd mobile
eas build --platform ios --profile preview
```

Te va a pedir:
- Apple Developer account credentials (necesitás membresía paga, $99/año)
- Configurar provisioning profile y certs (EAS lo automatiza la primera vez)

Resultado: archivo `.ipa` que se distribuye via **TestFlight** (recomendado) o ad-hoc para devices específicos.

**Para TestFlight**:
1. Build production: `eas build --platform ios --profile production`
2. `eas submit -p ios` (sube a App Store Connect)
3. En App Store Connect → TestFlight → invitar testers (los emails deben estar registrados como testers)
4. Los testers reciben email + link para instalar via app TestFlight

### App Store / Play Store production

Cuando el equipo quiera distribuir oficialmente al público:

| Store | Requisito |
|---|---|
| Play Store (Android) | Cuenta Google Play Developer ($25 una vez), build production con `eas build --platform android --profile production`, `eas submit -p android` |
| App Store (iOS) | Cuenta Apple Developer ($99/año), screenshots, descripción, política de privacidad, ratings — más burocracia |

Documentación oficial: https://docs.expo.dev/submit/introduction/

---

## OTA Updates (Over-the-Air)

`app.json` ya tiene configurado:
```json
"runtimeVersion": "1.0.0",
"updates": {
  "url": "https://u.expo.dev/c51c210a-f0d2-482a-b420-a2aa0b626221"
}
```

Esto significa que podés **publicar updates de JS/assets sin rebuildear el binario**. Útil para:
- Bug fixes urgentes (no esperar review de App Store)
- Cambios de copy
- Tweaks visuales

**Para publicar un update OTA**:

```bash
cd mobile
eas update --branch preview --message "Fix bug X"
```

La próxima vez que el user abra la app standalone (no Expo Go), descarga el update automáticamente. Sin re-instalar.

> **Limitaciones**: OTA solo funciona para cambios en JS / assets. Si cambiaste código nativo (agregaste deps con código nativo, cambiaste permisos en `app.json`, etc.), necesita rebuild de binario. Para identificar si necesita rebuild, bumpeá `runtimeVersion` en `app.json`.

---

## Troubleshooting

### "There was a problem running the requested app — Internet connection appears to be offline"

Síntoma: al escanear el QR, Expo Go muestra ese mensaje en pantalla negra.

Causa: el dispositivo no puede llegar al server de Metro (`exp://192.168.x.x:8081`). Razones típicas:
- Tu PC apagada o `npx expo start` no corriendo
- Dispositivo en red distinta a tu PC (ej. cellular en lugar de la misma WiFi)
- WiFi tiene client isolation (común en hoteles, oficinas, redes guest)
- Windows Firewall bloqueando node.exe

Fix: usar tunnel mode → `npx expo start --tunnel -c`. El URL pasa a ser `exp://abc.tunnel.expo.dev` y funciona desde cualquier red.

### Metro bundler arranca pero la app sigue mostrando una versión vieja del bundle

Causa: Expo Go cachea el bundle viejo localmente. Cuando no puede descargar el nuevo (red caída momentáneamente), muestra el cacheado.

Fix:
1. Cerrar Expo Go por completo (swipe up para matar la app, no solo background)
2. Reabrir, escanear el QR de nuevo
3. Si sigue mostrando viejo: en terminal de Metro apretá `r`, o en el dispositivo agitar → Reload
4. Última opción: `npx expo start --tunnel -c` (limpiar cache de Metro y reintentar)

### Cambios en código no se reflejan en el dispositivo

Causa: hot reload no detectó el cambio (a veces pasa con archivos editados desde fuera de Metro).

Fix:
1. Apretá `r` en la terminal de Metro
2. Si sigue: cerrá la app del dispositivo y volvé a abrir
3. Si sigue: `npx expo start --tunnel -c`

### "Network Error" o "Request timeout" desde la app

Causa: el dispositivo no llega al backend Railway.

Fix:
- Verificar que el celular tiene Internet (abrir Safari/Chrome y cargar una página)
- Verificar que `centralmillwork-backend-production.up.railway.app/health` responde (en cualquier browser)
- Verificar la URL en `mobile/src/services/api.ts` (no haya un typo o esté apuntando a localhost)

### Login funciona pero después la app se queda "cargando" en HomeScreen

Síntoma: el JWT se guarda OK pero las requests subsiguientes fallan con 401.

Causa probable: el token no se está mandando en el header. Posiblemente el interceptor de axios no está bien.

Fix:
- F12 / shake → Open Debugger → ver Network tab
- Verificar que las requests a `/api/*` lleven `Authorization: Bearer ...`
- Si no lo llevan: revisar `services/api.ts`, el interceptor `request.use`

### Permission denied al usar la cámara

Causa: el user no dio permiso de cámara la primera vez.

Fix:
- Settings (iOS) → Expo Go → Camera → ON
- Settings (Android) → Apps → Expo Go → Permissions → Camera → Allow
- O reinstalar Expo Go (la primera vez que se llame `requestCameraPermissionsAsync` vuelve a preguntar)

### Las fotos no se suben — "uploading" se queda colgado

Causa probable: el upload a Supabase está fallando porque:
- El backend no tiene acceso a Supabase (env vars `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` mal configuradas)
- El bucket no existe o cambió de nombre
- La imagen excede el límite de 10 MB

Fix:
- Revisar logs de Railway buscando `uploadImagen Supabase error`
- Verificar env vars del servicio backend en Railway
- Probar con una foto más chica para descartar tamaño

### EAS Build falla

Razones comunes:
- Quota mensual del free tier agotada (30 builds/mes en plan free)
- Credenciales de Apple Developer mal configuradas
- Conflicto de `runtimeVersion` o de package versions
- Conflict de `package-lock.json` desactualizado

Fix:
- Ver el log del build en https://expo.dev/accounts/chaliherrera/projects/centralmillwork/builds
- Si es problema de credenciales iOS: `eas credentials` para reconfigurar
- Si es problema de versions: borrar `package-lock.json` + `npm install` + commit

### OTA update publicado pero la app no lo recibe

Causa: el `runtimeVersion` cambió o el branch del update no matchea.

Fix:
- Verificar que el `runtimeVersion` en `app.json` matchea con el que tenía la app cuando se buildeó
- Si cambió: hay que rebuildear el binario, OTA no alcanza

---

## Pendientes para mejorar el módulo móvil

### Inmediatos
- **Mover `API_URL` a env / config** en lugar de hardcoded en `services/api.ts`. Usar `expo-constants` con `app.json.extra`.
- **Pantalla de "About"** con versión de la app (`Constants.expoConfig?.version`) para que en troubleshooting sea fácil saber qué bundle está corriendo.

### Próxima iteración
- **Distribución oficial via TestFlight + Play Store internal testing** para no depender de tunnel. EAS Build + EAS Submit.
- **Push notifications** para avisar al equipo en campo de OCs nuevas o updates de estado. Expo Notifications + EAS.
- **Soporte offline-first**: hoy la app falla si pierde conectividad mientras se registra una recepción. Considerar cache de mutations con TanStack Query + sync cuando vuelve la red.
- **Optimización de tamaño de fotos**: las fotos de cámara son grandes (~3-5 MB). Compress antes de upload con `expo-image-manipulator`.

### A futuro
- **Soporte de tablet** (`supportsTablet: true` ya está en `app.json` para iOS). Algunas pantallas podrían tener layout dedicado para tablet.
- **Testing automatizado** con Detox o Maestro.
- **Crash reporting** con Sentry o BugSnag (hoy nada).

---

## Referencias

- [Expo docs](https://docs.expo.dev/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Submit](https://docs.expo.dev/submit/introduction/)
- [EAS Update (OTA)](https://docs.expo.dev/eas-update/introduction/)
- [React Native](https://reactnative.dev/)
- Project en Expo: https://expo.dev/accounts/chaliherrera/projects/centralmillwork
