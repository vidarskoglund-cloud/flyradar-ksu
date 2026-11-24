# Systemoppsett – Kristiansund Trafikkradar

**Kontrollert i GitHub `main` 24.11.2026.** Dette dokumenterer kode og konfigurasjon, ikke en gjennomført live-verifikasjon av alle tjenester.

## Dataflyt og intervaller

| Funksjon | Kilde og mekanisme | Kodeobservert intervall |
| --- | --- | --- |
| Flyposisjon | Én aktiv posisjonskilde: adsb.fi v3 (direkte via eksisterende løsning) | `nextRefreshMs() = 5000` ms etter fullført `refresh()` |
| Fartøy | Kystverkets AIS via Cloudflare Worker | `setInterval(loadVessels,30000)` |
| KSU-rutetider | Avinor XML-feed, generert til `data/avinor-ksu.json` i GitHub Pages | Workflow hvert 10. minutt; frontend `loadAvinor` hvert 600000 ms |
| Ruteoppslag for fly | Worker `/route`: adsb.lol-ruteoppslag; avgrenset FlightAware-fallback | Behovsstyrt, ikke for hvert fly hvert 5. sekund |
| Vær | Egen Worker `/weather` | Egne innstillinger i `weather.js` |

**Historikk:** Tidligere dokumentasjon nevnte 15 sekunder, og eldre arbeidsnotater nevnte 60 sekunder for fly. Disse tallene er ikke gjeldende `app.js`-innstilling ved denne kodekontrollen. Ikke endre frekvens kun for å samordne dokumentene. Polling er ikke det samme som hvor ofte en ekstern mottaker faktisk leverer ny posisjon.

## Arkitektur

- `app.js`: kart, automatisk fokus, fly- og fartøyvisning, ruter, varsel- og oppdateringslogikk. Stor fil – resten deles gradvis opp i issue #19.
- `map/traffic-notice-utils.js`: trafikkmeldingsformattering og klassifisering, trukket ut i PR #64.
- `aircraft/track-history.js`: 30 minutters lokal sporhistorikk, samme lagringsnøkkel og størrelsesgrenser, trukket ut i PR #66.
- `aircraft/route-cache.js`: lokal rutecache, dagsnøkkel, lagring og utløp etter 24 timer, trukket ut i PR #68. Oppstart kalles fra `app.js` etter at rutefunksjonene er lastet.
- `.github/workflows/map-smoke.yml`: målrettede kart- og sporingstester, opprettet i PR #65 og utvidet i PR #66.
- `worker/src/index.js`: Cloudflare Worker, blant annet AIS, rutetjenester, API-tilgang og status. Utrullet Worker-versjon må verifiseres separat fra GitHub-koden.
- `.github/workflows/pages.yml`: Pages-bygg og Avinor-data. Nettsted: https://vidarskoglund-cloud.github.io/flyradar-ksu/
- `tests/`: regresjonstester, inkludert kartfokus. Tester kan ikke erstatte kontroll av publisert side med levende trafikk.

## Arbeids- og sikkerhetsregler

1. Behold én aktiv ADS-B-posisjonskilde og dagens AIS, Avinor og varslingsfunksjoner.
2. Endre ikke oppdateringsintervaller, datakilder eller API-kostnadsgrenser som del av ren opprydding.
3. Ta små PR-er og kontroller syntaks, relevante tester, GitHub Pages og eventuelt separat Worker-deploy.
4. Skill *kodeverifisert*, *produksjonsverifisert*, *planlagt* og *historisk* i status.
5. Bevar original historikk i `docs/ENDRINGSHISTORIKK.md`; ikke fjern den som duplikatopprydding.

## Åpne kontroller

- Issue [#18](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/18): faktisk trafikk, Windows/Tailscale, kart, AIS, varsler, feiltilfeller og rollback.
- Issue [#19](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/19): gradvis kodeoppdeling, med adferdstester før og etter.
- GitHub Pages og Cloudflare Worker må kontrolleres hver for seg etter relevante kodeendringer.

## Oppdeling – status 24.11.2026

- **Brukerobservert:** Nettstedet ble meldt fungerende før PR #66. Dette er ikke en separat test av siste utrulling.
- **Kodekontroll:** PR #64, #66 og #68 er slått sammen i `main`. Syntaks, avhengighetsrekkefølge og simulerte rutecache-scenarier er kontrollert.
- **Ikke verifisert:** Full GitHub Actions-kjøring etter siste merge og ny live-kontroll av flysporenes lagring/gjenoppretting.
- **Neste:** Bekreft map-smoke-workflow og sporhistorikk på publisert nettside før større flyrute- eller kartmoduler flyttes.
