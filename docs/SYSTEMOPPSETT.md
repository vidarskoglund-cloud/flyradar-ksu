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
- `map/focus-geometry.js`: heading-avvik og nautiske mil for automatisk kartfokus, skilt ut i PR #70 uten endring i beregningene.
- `map/aircraft-focus-priority.js`: isolert poengberegning for KSU-fly, lokaltrafikk og spesialfly (PR #72). Original poengrekkefølge og avstandsgrenser beholdt; 416 kombinasjoner uten differanser i kontroll.
- `map/focus-target.js`: valg mellom automatisk lokalfokus, rutinemessig havnetrafikk og korte glimt av fjerntrafikk, samt 30 sekunders fokuslås (PR #74). 1 920 scenarier uten endring i resultat.
- `map/focus-motion-decision.js`: beslutning om når automatisk zoombilde skal bevege seg, med uendret terskel for synlighet, zoomavvik og bevegelsessperre (PR #76). 4 000 scenarier uten differanser.
- `aircraft/track-history.js`: 30 minutters lokal sporhistorikk, samme lagringsnøkkel og størrelsesgrenser, trukket ut i PR #66.
- `aircraft/route-cache.js`: lokal rutecache, dagsnøkkel, lagring og utløp etter 24 timer, trukket ut i PR #68. Oppstart kalles fra `app.js` etter at rutefunksjonene er lastet.
- `aircraft/auto-route-eligibility.js`: automatisk rutekontroll kun for bekreftede KSU-fly eller tydelige innflyginger (PR #78). 20 sekunders avstand mellom automatiske forsøk per nettleser, maks ett automatisk forsøk per fly/dag i gjeldende økt. Workerens sentrale FlightAware-budsjett på 4,50 USD beholdt.
- Verifisert KSU-turnaround (PR #83): operativt kallesignal WIF5AD, registrering LN-WDI, forventet Avinor-avgang WF571 fra KSU til BGO. Krever tidsvindu, avgangsretning, flyplass og samsvar med registrering hvis tilgjengelig. Behold separat historikk for ankomst WIF5DY/WF570; ingen generelle antakelser om alle Widerøe-kallesignal.
- Tidlig fjernsporing (PR #79): adsb.fi v2-kallesignal og v3-radiusdata brukes ved BGO/OSL og KSU; betalt rutekontroll begrenset til maks to nye kandidater per ankomst/oppdagelsesrunde, én per kallesignal/dag i nettleserøkten. Ikke identifiser fly som KSU-rute uten bekreftet opprinnelses- og destinasjonsflyplass.
- `.github/workflows/map-smoke.yml`: målrettede kart- og sporingstester, opprettet i PR #65 og utvidet i PR #66.
- `worker/src/index.js`: Cloudflare Worker, blant annet AIS, rutetjenester, API-tilgang og status. Utrullet Worker-versjon må verifiseres separat fra GitHub-koden.
- `.github/workflows/pages.yml`: Pages-bygg og Avinor-data. Nettsted: https://vidarskoglund-cloud.github.io/flyradar-ksu/
- `tests/`: regresjonstester, inkludert kartfokus. Tester kan ikke erstatte kontroll av publisert side med levende trafikk.

## Besøksstatistikk – separat fra sporing

- PR #86 klargjør Cloudflare Web Analytics for `vidarskoglund-cloud.github.io`, kun på radarsiden.
- `analytics/config.js` inneholder foreløpig **ingen** nettstedstoken; tellerne er dermed ikke aktive. Administrator må registrere nettsiden hos Cloudflare og legge inn offentlig site-tag, ikke privat API-token.
- `analytics/beacon.js` respekterer lokal utelating før beacon lastes, og `admin.html` tilbyr per-nettleser av/på for å utelate egne besøk. Administratorpanelet samler ikke trafikkstatistikk selv.
- Ingen ekstra forespørsler til Workers, fly- eller AIS-API-er. Se `docs/BESOKSSTATISTIKK.md`.

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

- **Brukerobservert:** Nettstedet ble meldt fungerende etter PR #77. Dette er ikke en separat test av PR #78–79 og #83.
- **Kodekontroll:** PR #64, #66, #68, #70, #72, #74, #76, #78 og #79 er slått sammen i `main`. Syntaks, avhengighetsrekkefølge, rutecache, kartgeometri og flyfokus-prioritet er kontrollert isolert.
- **Ikke verifisert:** Full GitHub Actions-kjøring etter siste merge og ny live-kontroll av flysporenes lagring/gjenoppretting.
- **Neste:** Bekreft map-smoke-workflow, at BGO/OSL-avgangsfly oppdages mens de takser, og at WIF5DY-lignende kallesignal får korrekt rute etter bekreftet oppslag. Kontroller at betalt forbruk fortsatt ligger under 4,50 USD per måned.
