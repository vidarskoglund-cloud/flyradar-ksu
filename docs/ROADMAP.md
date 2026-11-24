# Flyradar KSU – utviklingsplan

**Sist gjennomgått:** 24. november 2026  
**Status:** Plan og prioriteringer; ikke en liste over ferdigtestede funksjoner.

## Formål

Videreutvikle Flyradar KSU fra et kart for fly rundt Kristiansund/Kvernberget til en oversiktlig kart- og sporingsplattform for **Kristiansund og Nordmøre**. Fly, helikoptre og båter kan dele kart, men ha separate datakilder, status, spor og varsler. KSU og Kristiansund havn er prioriterte områder.

**Hovedregel:** Stabilitet og lesbarhet foran flest mulig funksjoner. Behold et ryddig kart, og forbedre i små, kontrollerte endringer.

## Dagens implementasjon (kontrollert i `main` 22.11.2026)

| Tema | Implementert / observert | Begrensning / kontrollbehov |
| --- | --- | --- |
| Fly/helikopter | Én aktiv ADS-B-posisjonskilde (adsb.fi); `app.js` venter 5 sekunder etter fullført oppslag før neste | Avhengig av Windows-server, internett og mottakerdekning; test automatisk omstart |
| Båter | AIS fra Kystverket via Cloudflare Worker; frontend oppdaterer hvert 30. sekund | Faktisk AIS-posisjonsoppdatering kan være tregere |
| Kartfokus | KSU-innflyging, landing/taksing og lokale fly; bevegelige fartøy ved Kristiansund havn | Må testes ved faktiske samtidige hendelser og manuell zoom |
| Sporhistorikk | Flyspor lagres lokalt i nettleseren, planlagt tidsvindu 30 minutter | Lokal lagring er per nettleser/enhet; må verifiseres etter refresh og signaltap |
| Flyruter | Avinor-ruter, ekstra rutekilder og lagret informasjon per flynummer/dag | Rutedata kan mangle eller være usikre; test feiltilfeller og utløp |
| Varsler | 50 NM-varsel, nærhetslyd, operativ status på kartet | Mobilbakgrunn og lyd avhenger av OS/nettlesertillatelser |
| Flyfoto og fartøyinfo | Flytypekort, noen registreringsbilder, AIS-detaljer | Bilder/lisenser må verifiseres; ikke forveksle typefoto med individuelt fartøy |
| Administrasjon | Teknisk status og FlightAware-forbruk | Gjennomgå om logg og kostgrenser er korrekt og lett forståelige |

### Viktige eksisterende valg

- **KSU:** 63.1118, 7.8245; Kristiansund havn er sekundært fokusområde.
- **Oppdatering (kodekontroll 24.11.2026):** Flyoppslag starter 5 sekunder etter forrige fullførte oppslag (`nextRefreshMs()`); AIS forsøkes hvert 30. sekund. Avinor hentes hvert 10. minutt. Dette er ikke en live-måling av faktisk leveransefrekvens. Eldre 15/60-sekundersverdier er historiske.
- **Kilder:** Kun én ADS-B-kilde for posisjoner. Ikke introduser nye kilder uten vurdering.
- **Zoom:** Manuell styring skal overstyre automatikk en periode. KSU-landinger skal kunne følges tett.
- **Båtfokus:** Bare fartøy med faktisk posisjonsendring og tilstrekkelig hastighet. Fly med relevant KSU-aktivitet har forrang.
- **Historikk:** Ikke slett fungerende logikk, tidligere designvalg eller kildeinformasjon uten å dokumentere endringen.

## Utviklingsfaser

### 1. Stabilisering først
**Oppgave:** [#18 – Stabilisering, tester og driftssikkerhet](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/18)

Test faktisk trafikk, Windows-oppstart, Tailscale/ADS-B, AIS, 50 NM-varsler, lyd, lagrede spor og bilder. Lag en enkel test- og rollbackrutine.

### 2. Ryddigere arkitektur
**Oppgave:** [#19 – Kodeoppdeling og kartprioritering](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/19)

Splitt gradvis den store `app.js` i moduler for datakilder, kart/fokus, fly, båter, varsler, historikk og UI. Test samme atferd før/etter; ikke gjennomfør en stor samtidig omskriving.

### 3. Bedre AIS og Kristiansund havn
**Oppgave:** [#20 – Havne- og AIS-sporing](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/20)

Avklar havneområder, prioritering av inn-/utseilinger, fartøyinfo og mulig sporhistorikk; unngå fokus på stillestående båter.

### 4. Enklere visning og personlige innstillinger
**Oppgave:** [#21 – Visning og varsler](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/21)

Enkel navigasjon for Fly/Båter/Områder, lokale valg, tydelig faktisk varslingsstatus, og teknisk informasjon under administrasjon.

### Neste oppgave: felles register for prioritert trafikk

**Oppgave:** [#89 – prioritert fly- og fartøytrafikk](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/89). Kartlegging dokumentert i [PRIORITERT-TRAFIKK.md](PRIORITERT-TRAFIKK.md). Vi begynner med verifisert Kystekspressen-flåte og karakteriseringstester; identitet, ikon, dekning og kartfokus holdes adskilt. Ingen aktiv kodeendring eller Cloudflare Worker-deploy er utført som del av kartleggingen.

## Planlagt teknisk oppdeling (ikke gjennomført)

```text
Datakilder:     ADS-B / AIS / Avinor / eksterne ruteoppslag
Domenemodeller: fly, helikoptre, skip, områder og historikk
Kart:           symboler, sporing, automatisk fokus og manuell overstyring
Varsling:       50 NM, lyd, nettleser/push og deduplisering
Presentasjon:   høyrepanel, typekort, rutelister og mobilvisning
Drift:          feillogger, kildehelse, tilgang og API-kostnader
```

Innfas moduler trinnvis for å bevare den publiserte nettsidens funksjonalitet.

## Arbeidsregler for nye endringer

1. Beskriv målet og berørte funksjoner i et GitHub-issue.
2. Gjør én avgrenset endring på egen branch / pull request.
3. Kontroller syntaks, relevante scenarier, mobilvisning og eventuelle API-kall.
4. Publiser kun etter kontroll. Verifiser live og noter eventuelle åpne feil.
5. Dokumenter viktige beslutninger og oppdater dette dokumentet ved endret retning.

**Ikke gjør:** Automatisk ombygging av produksjonsserver, endring av ADS-B-kilder, flere API-oppslag eller sletting av historikk som del av en dokumentasjonsoppgave.

## Gjeldende status og neste steg

- **Besluttet:** Fortsette å utvikle Flyradar KSU som én oversiktlig plattform, med KSU og Kristiansund havn som hovedområder.
- **Dokumentert:** Dagens struktur, datakilder og fire prioriterte utviklingsfaser.
- **Ikke gjennomført:** Full ende-til-ende-test og arkitekturrefaktorering.
- **Neste konkrete steg:** Begynn med [fase 1, issue #18](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/18). Dokumenter testresultater før kodeoppdeling.

**Arkivering:** Planen ligger i GitHub sammen med prosjektets kode. Privat Google Drive og arbeidsområder brukes ikke til denne dokumentasjonsjobben.
