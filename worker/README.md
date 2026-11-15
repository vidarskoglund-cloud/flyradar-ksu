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
