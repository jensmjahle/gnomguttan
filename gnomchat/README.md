# GnomChat

Expo-app med native kanalliste, meldingsbobler, skrivefelt, vedlegg, galleri, kalender og temavelger. Chatten bruker Matrix. Mobilskjermene bygger på den opprinnelige appen; nettsiden lastes ikke som chatgrensesnitt.

Matrix-innloggingen gjelder chatten. Galleri og kalender har fortsatt sin egen gamle VoceChat-innlogging og kan åpnes fra fanene uten Matrix-innlogging. SSE og lokale lesemarkeringer er erstattet med Matrix-synkronisering og serverbaserte lesebekreftelser.

Matrix SDK og Rust/WASM-kryptering kjører i en skjult lokal WebView som protokollmotor. Den inneholder bare lokalt bundlet JavaScript/WASM, og viser ingen nettside. Synlig UI og navigasjon er React Native. Matrix-token lagres i SecureStore, krypteringsdatabasen lokalt i WebViews IndexedDB. Motoren finnes ferdig generert i `src/generated/matrixEngine.ts` for Expo/EAS; regenerer fra dette repoet med `npm run build:matrix-engine` når `matrix-engine/main.ts` endres (krever rotprosjektets npm-avhengigheter).

## Utvikling

SDK 57: Start i Expo Go med `npx expo start --clear --go`. Varslingspakken lastes bare i egne appbygg, siden Expo Go mangler native moduler som pakken forventer. Chat, kalender og galleri kan testes i Expo Go; pushvarsler krever et oppdatert development/preview/production-bygg.

Kjør `npm test` for regresjonstester av Expo Go-oppstart, native varsling, varselsynlighet, chatlenker og innloggingsbytte. Disse testene bruker simulerte native API-er og erstatter ikke testing på telefon.

Kjør npm ci, npm start og npm run lint i denne mappen. Chatten trenger direkte HTTPS-tilgang til Matrix-serveren. Produksjon krever moderne Android System WebView/iOS med IndexedDB, Web Crypto og WebAssembly. Pushgatewayen på hovedserveren må være tilgjengelig for egne appbygg.

## Push-oppsett

1. Sett en stabil, tilfeldig MATRIX_MOBILE_PUSH_SECRET på serveren, for eksempel 32 tilfeldige byte representert som hex. Hemmeligheten skal bare ligge på serveren.
2. Sett MATRIX_MOBILE_PUBLIC_URL=https://gnomguttan.no. /matrix-mobile/register og /_matrix/push/v1/notify må rutes til Node-serveren. Synapse må nå gatewayen over HTTPS. Docker Compose videresender variablene.
3. Matrix-serveradressen må samsvare med serverens MATRIX_HOMESERVER_URL. Gatewayen verifiserer Matrix-token mot denne serveren og lagrer ikke tokenet.
4. Android-bygget trenger Firebase-filen via GOOGLE_SERVICES_JSON (filsti), og FCM V1-legitimasjon i Expo/EAS. iOS trenger APNs-legitimasjon. Ved Expo enhanced push security trenger serveren EXPO_ACCESS_TOKEN.
5. Bygg en ny development/preview/production-app. Expo Go er ikke tilstrekkelig for Android push. Gi varslingstillatelse på en fysisk telefon.

Appen registrerer en standard Matrix HTTP-pusher med event_id_only. Synapse evaluerer kontoens push-regler og romdemping. Gatewayen sender generiske varsler uten meldingstekst via Expo. E2EE-nøkler forblir i klienten. Trykk på varsel åpner rommet, også ved kaldstart. Varsler for synlig rom undertrykkes i forgrunnen. Lesebekreftelser sendes bare når chatten er synlig og man er nederst i samtalen. Gamle VoceChat-pushregistreringer avregistreres hvis gammel sesjon fortsatt er gyldig.

Gatewayen dedupliserer i et begrenset minnecache i opptil ett døgn; serveromstart kan gi gjentatte varsler. Midlertidige Expo-feil gir 502 slik at Synapse kan prøve igjen. Ugyldige nøkler og umiddelbare DeviceNotRegistered-feil avvises. Asynkrone Expo-leveringskvitteringer blir foreløpig ikke poll-et. Levering til OS må verifiseres på telefon.

## Validering før utrulling

- Fra repo-roten: node --test server/matrixMobilePush.test.js og npm run build. Her: npm run lint.
- Test to kontoer i krypterte og åpne rom, inkludert verifisering og historikkgjenoppretting.
- Test lesebekreftelser ved rombytte, bakgrunn, fanebytte og lesing av eldre historikk.
- Test varsler med låst skjerm, bakgrunn, avsluttet app, dempet rom og avslått tillatelse. Test kaldstart fra varsel.
- Kontroller behovsstyrt gammel innlogging, og at utlogging fra galleri/kalender lar Matrix-økten bestå.
- Test kamera, lyd, vedlegg, posisjon, tastatur og Android tilbakeknapp på telefon.

Se SETUP.md for EAS-signering og Google Play. Tema/font synkroniseres med npm run sync-theme.

CI krever GitHub-secret GOOGLE_SERVICES_JSON med innholdet fra Firebase-konfigurasjonen. Dette kommer i tillegg til eksisterende EXPO_TOKEN og Google Play-servicekonto. FCM V1-legitimasjonen må også være registrert i Expo/EAS.
