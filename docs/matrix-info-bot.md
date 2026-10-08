# Matrix-informasjonsbot («gnomen»)

Boten kjører på Node-serveren, bruker en vanlig Matrix-konto og sender `m.notice`-meldinger til ett valgt rom. Den gamle VoceChat-boten, påminnelsene og innloggingen beholdes. En application service er ikke nødvendig for denne informasjonsboten.

## Første oppsett

1. Bruk en egen konto til boten, for eksempel `gnomen`. Den fulle Matrix-ID-en vises i kontoinnstillingene og kan ha et annet servernavn enn homeserverens URL.
2. Inviter botens Matrix-ID til rommet som skal motta varsler. Gi den tillatelse til å sende meldinger. Et space er en romsamling; velg et samtalerom inne i spacet som mottaker.
3. Bruk romaliaset `#kosegjengen:gnomchat.gnomguttan.no`, eller kopier rom-ID-en fra rominnstillingene i Chat2.0. Moderne rom-ID-er kan også være uten `:server`.
4. Sett disse verdiene i serverens `.env` / containerkonfigurasjon:

```dotenv
MATRIX_BOT_ENABLED=true
MATRIX_BOT_HOMESERVER_URL=https://gnomchat.gnomguttan.no
MATRIX_BOT_USERNAME=@gnomen:gnomchat.gnomguttan.no
MATRIX_BOT_PASSWORD='sett-passordet-lokalt-her'
MATRIX_BOT_TARGET_ROOM_ALIAS='#kosegjengen:gnomchat.gnomguttan.no'
APP_PUBLIC_URL=https://gnomguttan.no
```

Bruk full Matrix-ID som `MATRIX_BOT_USERNAME`. Legg aldri passordet eller tilgangstokenet i frontendkode, `env.js`, Git eller chatmeldinger. Bruk anførselstegn i `.env` hvis passordet har `#` eller mellomrom. Docker Compose kan kreve `$$` for et bokstavelig `$` i miljøverdier.

Romaliaset slås opp til en rom-ID ved oppstart. `MATRIX_BOT_TARGET_ROOM_ID` kan brukes i stedet og har prioritet over aliaset. Den oppslåtte ID-en vises i oppstartsloggen. Hvis et alias peker til et nytt rom etter et nytt sendeforsøk, stoppes allerede klargjorte varsler med `MATRIX_BOT_TARGET_CHANGED` i stedet for å sendes til feil rom.

5. Start/redeploy Node-tjenesten med den nye konfigurasjonen. Loggen viser `Connected as …, device …` når økten er klar. Publiser et testarrangement for å kontrollere levering.

Boten logger inn én gang og lagrer tilgangstoken og enhets-ID i `session.json`. Ved senere oppstarter brukes samme økt, uten ny passordinnlogging. Når første innlogging er lagret kan `MATRIX_BOT_PASSWORD` fjernes fra miljøet. Hvis du allerede har et token for en egen botenhet, kan `MATRIX_BOT_ACCESS_TOKEN` brukes ved første oppstart i stedet.

## Lagring og kryptering

Boten støtter ende-til-ende-krypterte og vanlige rom. Kryptering gjøres av `matrix-bot-sdk` med den native Rust crypto-SDK-en. Hvis kryptering eller tilgang feiler, legges meldingen tilbake i kø; den sendes ikke som ukryptert reserve.

Docker Compose lagrer økt, sync-posisjon og krypteringsnøkler i volumet `matrix-bot` på `/data/matrix-bot`. Uten Docker er standarden `./data/matrix-bot`, eventuelt overstyrt med `MATRIX_BOT_STORAGE_DIR`. Ta sikkerhetskopi av hele katalogen, og bevar volumet ved redeploy. Den inneholder hemmeligheter og skal bare være tilgjengelig for serveren.

Kjør én botprosess per botenhet og lagringskatalog. Boten skal ikke bruke samme enhet/token som en nettleserøkt. Hvis tokenet blir ugyldig eller deler av nøkkellageret mistes, gjenopprett en full, sammenhengende sikkerhetskopi eller bruk en ny lagringskatalog og en ny botøkt. Koden bytter ikke enhet inne i et eksisterende kryptolager.

Node.js 22 eller nyere kreves. Dockerfile og PR-kontrollen bruker Node 22.

## Varsler

- Når et arrangement publiseres: opprettelsesmelding med lenke.
- Ved endring av navn, tidspunkt, sted, beskrivelse, bilde eller arrangementstype.
- Nye/endret deltakersvar, tidsforslag og stemmer.
- Nye innlegg, avstemninger, svar, stemmer og reaksjoner i diskusjonen.
- Endringer i oppgaver, medarrangører og arrangementsinnstillinger.
- Ved sletting av et publisert arrangement.

Utkast annonseres ikke. En lagring uten faktiske innholdsendringer eller et identisk deltakersvar gir ingen ny melding. Flere endringer i samme lagring samles i ett varsel. Boten starter ikke med å sende historiske arrangementer.

Varsler lagres i MongoDB-samlingen `matrix_bot_outbox`, med automatisk retry og samme Matrix-transaksjons-ID ved usikker levering. Klargjort kryptert innhold beholdes mellom forsøk. Ved overgang tilbake til utkast fjernes ventende varsler for arrangementet. Sendte køposter slettes automatisk etter 30 dager; usendte blir liggende til levering. En botfeil stanser ikke arrangementslagringen eller VoceChat-boten.

## Feilsøking

- `MATRIX_BOT_CREDENTIALS_MISSING`: sett passord/token for første innlogging.
- `M_FORBIDDEN`: kontroller passordet, invitasjonen og botens senderettigheter.
- `M_UNKNOWN_TOKEN`: botøkten er utløpt. Bruk en ny botøkt med ny lagringskatalog eller gjenopprett riktig økt.
- `MATRIX_BOT_SESSION_MISMATCH` / `MATRIX_BOT_STORAGE_INCOMPLETE`: konfigurasjon, øktfil og kryptolager passer ikke sammen. Gjenopprett hele lagringen eller velg en ny katalog.
- `MATRIX_BOT_TARGET_IS_SPACE`: velg et vanlig samtalerom i spacet.

Passord og tokens logges ikke. Loggen viser feilkoder; leveringsforsøk og siste feilkode finnes også i sendekøen.

## Tester og referanser

```bash
npm run test:matrix-bot
```

- [Matrix: introduksjon til bots](https://matrix.org/docs/older/matrix-bot-sdk-intro/)
- [Bot-SDK: krypterte bots og vedvarende lagring](https://turt2live.github.io/matrix-bot-sdk/tutorial-encryption-bots.html)
- [Matrix Client-Server API](https://spec.matrix.org/latest/client-server-api/)
