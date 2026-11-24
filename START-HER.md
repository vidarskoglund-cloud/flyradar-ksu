# START HER – Kristiansund Trafikkradar

**Sist gjennomgått:** 24.11.2026  
**Status:** Pågående stabilisering og strukturering. Kodeobservert status er ikke det samme som test av publisert drift.

Kristiansund Trafikkradar viser fly/helikopter og fartøy ved Kvernberget, Kristiansund og Nordmøre. Behold eksisterende repo og nettadresse.

## Viktige lenker

- [Publisert nettside](https://vidarskoglund-cloud.github.io/flyradar-ksu/)
- [Systemoppsett – gjeldende kilde- og intervalloversikt](docs/SYSTEMOPPSETT.md)
- [Driftskontroll – test og tilbakeføring](docs/DRIFTSKONTROLL.md)
- [Utviklingsplan](docs/ROADMAP.md)
- [Endringshistorikk – tidligere fullstendig START HER](docs/ENDRINGSHISTORIKK.md)
- [#18 Stabilisering og driftssikkerhet](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/18)
- [#19 Kodeoppdeling](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/19)
- [#20 AIS og havn](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/20)
- [#21 Visning og varsler](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/21)

## Gjeldende status (kodekontroll 24.11.2026)

- Fly: én aktiv ADS-B-posisjonskilde, adsb.fi. `app.js` angir 5 sekunders pause mellom fullførte oppslag; reell datatilgjengelighet kan være tregere.
- Fartøy: Kystverkets AIS via Worker, frontend-oppslag hvert 30. sekund.
- Avinor KSU: GitHub Pages henter XML og bygger JSON etter en 10-minutters plan; frontend leser hvert 10. minutt.
- Automatisk fokus, varsler, rutetjenester, spor og fartøyvisning er implementert, men full live-verifikasjon gjenstår.
- PR #59 rettet callsign ved ruteoppslag og avvisning av ugyldig rutecache. PR #60 utvidet inkludering av valgt fly i kartutsnittet til 100 NM. Koden er slått sammen i `main`; brukeropplevelse mot faktiske fly må fortsatt observeres.
- Tidligere opplysninger om 15 eller 60 sekunders flyoppdatering er historiske og skal ikke styre ny konfigurering.

## Fremdrift kodeoppdeling (24.11.2026)

- PR #64: trafikkmelding-hjelpere flyttet til `map/traffic-notice-utils.js`.
- PR #65: målrettet GitHub Actions-testworkflow opprettet.
- PR #66: lokal sporhistorikk flyttet til `aircraft/track-history.js`, med versjonsoppdatering av `app.js` for å unngå gammel nettlesercache.
- PR #68: rutecache flyttet til `aircraft/route-cache.js`, med lagring, validering, utløp og regresjonstester; live-kontroll etter sammenslåing gjenstår.
- PR #70: rene geometrihjelpere for kartfokus flyttet til `map/focus-geometry.js` med egne tester. Selve kartprioriteringen er uendret.
- PR #72: poengberegningen for automatisk flyfokus skilt ut til `map/aircraft-focus-priority.js`. 416 kombinasjoner sammenlignet mot gammel logikk, uten avvik. AIS- og kartstyring er ikke endret.
- PR #74: valg av automatisk kartmål og 30-sekunders sperre skilt ut til `map/focus-target.js`. 1 920 sammenligninger mot tidligere kode uten avvik. Selve zoomen, manuell styring og AIS-prioritet er uendret.
- Bruker rapporterte at nettsiden fungerte før PR #72. Utrulling og full GitHub Actions-kjøring etter PR #72 er ikke bekreftet her.

## Neste arbeid

1. Fullfør test- og driftskontroll i #18, herunder publisert Pages, separat Worker, Tailscale/lokal server, AIS og manuell kartzoom.
2. Start deretter #19 med små, testbare kodeflyttinger. Ingen stor omskriving.
3. Arbeid videre med #20 og #21 uten å redusere eksisterende funksjoner.

## Regler for videre arbeid

- Les først denne siden, `docs/SYSTEMOPPSETT.md`, `docs/ROADMAP.md`, relevant issue og nyeste commit.
- Skill mellom bekreftede live-resultater, kodeobservasjoner, planer og historikk.
- Behold datakilder, polling, API-kostnadsgrenser, AIS og varslingslogikk med mindre egen endring er godkjent og testet.
- Bruk en avgrenset PR per oppgave. Dokumenter tester, feil og mulighet for tilbakeføring.
- Historisk tekst er bevart ordrett i `docs/ENDRINGSHISTORIKK.md`.
