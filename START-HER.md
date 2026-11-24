# START HER – Kristiansund Trafikkradar

**Sist gjennomgått:** 24.11.2026  
**Status:** Pågående stabilisering og strukturering. Kodeobservert status er ikke det samme som test av publisert drift.

Kristiansund Trafikkradar viser fly/helikopter og fartøy ved Kvernberget, Kristiansund og Nordmøre. Behold eksisterende repo og nettadresse.

## Viktige lenker

- [Publisert nettside](https://vidarskoglund-cloud.github.io/flyradar-ksu/)
- [Systemoppsett – gjeldende kilde- og intervalloversikt](docs/SYSTEMOPPSETT.md)
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
