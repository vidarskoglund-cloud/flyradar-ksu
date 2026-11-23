# Flyradar KSU - Cloudflare Worker

Denne Worker-en er mellomledd mellom Flyradar KSU og de åpne flydatakildene.

## Hva den gjør

- henter fly innen 150 NM fra KSU/Kvernberget
- henter parallelt fra adsb.lol og Airplanes.live
- slår sammen og dedupliserer fly
- cacher kildekall kort
- gir alle PC-er, iPhone-er og iPad-er samme datasett
- har `/health` for enkel kontroll

## Endepunkter

- `/` eller `/aircraft` - flydata
- `/health` - helsekontroll

## Publisering

Prosjektet er klart for Cloudflare Workers med Wrangler.

Fra denne `worker`-mappen:

```
npm install
npx wrangler login
npm run deploy
```

Etter publisering får Worker-en en adresse på formen:

`https://flyradar-ksu-api.<konto>.workers.dev`

Den adressen skal deretter legges inn i Flyradar KSU-nettsiden som eneste live-datakilde.

## Viktig

Nettsiden er foreløpig ikke endret til å bruke Worker-en. Det gjør vi først når Worker-adressen er kjent og testet.

## DATEX II 3.1 - test (egen gren, ikke produksjon)

`GET /datex/check` tester kun autentisering og HTTP/XML-respons fra
Statens vegvesens `GetSituation/pullsnapshotdata`. Det returnerer aldri passord,
Authorization-header eller rått XML-innhold. Resultatet caches på kanten i
5 minutter ved vellykket oppslag, ellers 1 minutt. Uten hemmeligheter svarer
tjenesten med `credentials_missing` (HTTP 503).

Ved godkjent test settes `DATEX_USERNAME` og `DATEX_PASSWORD` som **Cloudflare
Worker secrets** i kontrollpanelet for `flyradar-ksu`, aldri i GitHub-filer,
Wrangler-konfigurasjon eller nettsidens JavaScript. Først deretter kjøres den
lesebaserte kontrollen. Ingen data vises i Trafikkradaren før XML-formatet er
verifisert mot et ekte svar og geografisk filtrering er testet.

Viktig: Push til `main` for filer i `worker/**` starter automatisk Worker-deploy.
Denne grenen må ikke merges til `main` før DATEX-testen er klar.
