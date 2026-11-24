# Besøksstatistikk – Cloudflare Web Analytics

**Status 24.11.2026:** Kode for statistikk og filtrering av egen nettleser er lagt til. Ingen besøk samles inn før en faktisk nettstedstoken er satt inn i `analytics/config.js`.

## Aktivering (én gang)

1. Gå til Cloudflare Dashboard → **Web Analytics** → **Add a site**.
2. Registrer vertsnavnet `vidarskoglund-cloud.github.io` (GitHub Pages). Dette er **ikke** Cloudflare Workers eller Pages; sett opp manuell JavaScript-måling.
3. Fra **Manage site**, kopier verdien for `token` fra Cloudflares JavaScript-kode (vanligvis 32 heksadesimale tegn).
4. I GitHub-repositoriet, åpne `analytics/config.js` og erstatt den tomme verdien i `window.FLYRADAR_ANALYTICS_TOKEN='';` med nettstedstoken. Dette er en offentlig nettstedidentifikator, **ikke** en API-nøkkel.
5. Publiser via eksisterende GitHub Pages og kontroller nettverkstrafikk til `static.cloudflareinsights.com` og `cloudflareinsights.com` fra en nettleser som ikke er utelatt. Besøkstall vises i Cloudflares Web Analytics-panel etter noe tid.

**Ikke** legg private API-nøkler, kontopassord eller Cloudflare API-token i denne filen.

## Utelat egen trafikk

- Åpne `admin.html` på hvert av dine egne nettleserprofiler/enheter.
- Under **Besøksstatistikk – andre brukere**, trykk **Utelat mine besøk på denne enheten**.
- Når status viser at egne besøk ikke telles, gå tilbake til radaren.
- Alternativt åpne radar-URL med `?exclude_stats=1` for å lagre samme valg på denne nettleseren før beaconskriptet lastes.
- `?exclude_stats=0` aktiverer telling igjen for den aktuelle nettleseren.
- Dette filtrerer kun denne enheten/nettleserprofilen, ikke din IP eller kontoen på andre enheter. Besøk registrert **før** utelating kan ikke trekkes fra historisk.
- Besøkende kan også velge utelating; unik-besøkstall er estimerte og ikke personidentifikasjon.

## Omfang og drift

- Cloudflare Web Analytics teller bare visning av radarsiden; `admin.html` sender ingen beacon.
- Ingen API-kall til `flyradar-ksu` Worker, ingen ekstra AIS/flypolling og ingen FlightAware-kostnader.
- Kun initial sidevisning; automatisk kartoppdatering og fly- og fartøyskifte regnes ikke som nye sidevisninger.
- Nettstedstoken er bevisst uutfylt i GitHub før Cloudflare-oppsettet er opprettet. **Ikke påstå at trafikken måles før dette er verifisert.**
- Se Cloudflares eget panel for sidevisninger, besøk og anslåtte unike besøkende; administrasjonssiden linker dit og har utelatingsbryteren.
- Cloudflare Web Analytics: https://developers.cloudflare.com/web-analytics/get-started/
