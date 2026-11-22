# START HER – Kristiansund Trafikkradar

**Sist oppdatert:** 22.11.2026  
**Status:** Dokumentasjonsinngang; funksjoner og produksjon er ikke re-testet som del av denne oppdateringen.

## Formål og lenker
Kristiansund Trafikkradar er videreutviklingen av Flyradar KSU for fly, helikoptre og AIS-båttrafikk ved Kristiansund/Kvernberget og Nordmøre. Eksisterende repo og nettadresse beholdes.

- [Publisert nettside](https://vidarskoglund-cloud.github.io/flyradar-ksu/)
- [Utviklingsplan og teknisk oversikt](docs/ROADMAP.md)
- [Fase 1 – stabilisering](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/18)
- [Fase 2 – kodeoppdeling](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/19)
- [Fase 3 – AIS/havn](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/20)
- [Fase 4 – visning/varsler](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/21)

## Gjeldende kildegrunnlag
`docs/ROADMAP.md` er gjennomgått 22.11.2026 og beskriver gjeldende implementasjon på `main` **ifølge dokumentet**, ikke en ny ende-til-ende-test:

- Fly: én ADS-B-kilde (adsb.fi), via lokal Windows-PC/Tailscale; omtrent 15 sekunder mellom frontend-oppslag.
- Båter: AIS fra Kystverket via Cloudflare Worker; frontend-forsøk omtrent hvert 30. sekund.
- Kart: prioritet til KSU-fly, med AIS-fokus for fartøy som faktisk beveger seg; manuell zoompause.
- Ruter/spor/varsler: flere funksjoner er beskrevet, men praktisk funksjon og begrensninger skal verifiseres i fase 1.
- Eldre samtalestatus om 60 sekunders flyoppdatering er historisk og må ikke automatisk overstyre den nyere dokumenterte 15-sekunders implementasjonen.

## Prioritet
**Først:** Gjennomfør fase 1 / issue #18, test og dokumenter faktiske trafikkdata, oppstart etter Windows-restart, Tailscale, ADS-B/AIS, varsler, spor og tilbakeføring. Deretter arbeides det videre med #19–21 i små endringer.

## Regel ved hver arbeidsøkt
1. Les denne filen, `docs/ROADMAP.md`, relevante issues og nyeste commit før endringer.
2. Skill mellom **bekreftet i live-test**, **observert i kode/dokumentasjon**, **besluttet**, **planlagt**, og **uavklart**.
3. Noter hva som ble forsøkt, teknisk konfigurasjon, testresultat, feil og neste konkrete steg i relevant issue / utviklingsplan.
4. Bruk små, kontrollerte endringer, test før produksjon, og dokumenter eventuell rollback.
5. Oppdater dette dokumentet ved vesentlige endringer i prosjektstatus eller arkitektur. Bevar tidligere beslutninger og endringshistorikk.
6. Privat Google Drive er langtidsarkiv for konsolidert status/historikk; kode og teknisk oppgavesporing ligger i GitHub.

**Ikke endre fungerende produksjonskode, datakilder, frekvenser, AIS eller varsler som en ren dokumentasjonsjobb.**

## Siste kodeendring – 22.11.2026
- [PR #27 – roligere kartfokus og dynamisk flypanel](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/27) er slått sammen i `main` (commit `ab387af32f9307705612f86671d4002299976851`).
- Passerende fly over 25 NM skal ikke dra kartfokuset bort fra Kristiansund. 10–25 NM gir moderat fokus og under 10 NM tettere fokus; bekreftede KSU-ankomster/avganger kan prioriteres før 25 NM.
- Kartet vender tilbake til oversikt etter ca. 25 sekunder uten relevant trafikk; 30 sekunders fokusbyttelås og to minutters manuell pause er beholdt.
- Høyrepanelet har dynamisk overskrift; 50 NM-telleren er korrigert uten å endre nærhetsbannerets 25 NM-grense.
- GitHub Actions-test for kartfokus besto. Fire eldre tester i `tests/motion.test.cjs` feilet fra eksisterende testharness; de er synlig kjørt separat, og er ikke bekreftet løst.
- **Liveverifisering:** GitHub `main` er kontrollert; reell nettleser-/trafikktest av publisert Pages-kart og AIS gjenstår.
- Urelatert [PR #25 om skipsinformasjon](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/25) er ikke slått sammen i denne endringen.
