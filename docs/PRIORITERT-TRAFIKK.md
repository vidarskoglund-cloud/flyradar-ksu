# Prioritert trafikk – kartlegging og plan

**Kilde:** GitHub `main`, kontrollert 24.11.2026.  
**Status:** Kartlegging og forslag; **ingen endring i aktiv sporing**.  
**Oppgave:** [#89 – felles register for prioritert trafikk](https://github.com/vidarskoglund-cloud/flyradar-ksu/issues/89).

## Mål

Ha én testbar kilde for kjente, prioriterte fly og fartøy, med separate avgjørelser for:
1. **Identitet:** hvilket bestemt fartøy/fly eller hvilken trafikkgruppe gjelder dette?
2. **Presentasjon:** navn, ikon, kategori, detaljkort, spor.
3. **Dekning:** hvilke fartøy/luftfartøy er kvalifisert for visning i hvilket område og ved hvilken fart?
4. **Automatisk fokus:** hvilken trafikk skal kartet velge, og hva skal aldri overstyre manuelle valg?

En kjent identitet skal **ikke** automatisk bety høy kartfokusprioritet.

## Kodekontrollert eksisterende logikk

| Område | Kilde og regel | Begrensning / ønsket tiltak |
| --- | --- | --- |
| EKSPRESSEN | `app.js` `featuredFastFerry()`, MMSI `258416000`, navn kun når MMSI mangler. Eget cyan ikon og navn, PR #85 | Ikke del av Workers navngitte hurtigbåtliste; identitet og klassifisering er spredt |
| Hurtigbåter generelt | `worker/src/index.js` `/vessels` bruker navn `TRONDHEIMSFJORD`, `TER NINGEN`, `TERNINGEN`, `TYRHAUG`, `FJORDPRINSESSEN`, `FJORDDRONNINGEN`; AIS-type 40–49 + destinasjon gir `mulig_hurtigbat` | Ikke verifisert, uttømmende fartøyregister. Match mot navnet `TER NINGEN` kan være feilvariant/eldre kode; verifiser mot faktisk AIS før endring |
| Fartøydekning | Worker `/vessels`: fart >=1 knop, avstand <=25 NM fra KSU for generiske fartøy, <=110 NM for kategoriserte | Stillestående hurtigbåter ved kai filtreres bort. Full Trondheim–Kristiansund-dekning ikke bekreftet. Ikke øk dekningen ukritisk pga. CPU/last |
| Lokal rutineferge | `app.js` `routineLocalFerry()`: TUSTNA, MMSI `257087420`, IMO `9855393` | Skal være synlig når datakriteriene tillater, men få lavere automatisk fokus |
| Automatisk havnefokus | `movingHarborVessel()`: >=1,5 knop, nylige observerte posisjonsendringer og havnenærhet. `autoSelectHarborVessel()` følger kartprioriteringen | Ikke la kaiopphold eller ønsket fremheving skape kartflimmer |
| Hurtigruten/Havila | Workers `coastal`-navneliste gir `hurtigrute`; `app.js` viser kategorien | Kategorisering etter navn er sårbar for alias/renaming |
| KSU-rutefly | `ksuPriorityScore()`, `priorityKsuAircraft()`, Avinor-flyplaner og verifiserte rutekoblinger | Behold landings-/avgangsfokus, særlig tidlig BGO/OSL-sporing og PR #83-turnaround |
| Spesialfly | `specialFlightCategory()`: luftambulanse, SAR, politi, kystvakt, militær, beredskap, med rank 4,1–4,8; `specialService()` for offshore | Krever operativ støtte i kallesignal/operatør, ikke bare flytype; lavere fokus enn bekreftet KSU-trafikk |
| Helikopterikon | `isHelicopter()` og `planeIcon()` bruker type/beskrivelse/operatør | Bevar typeklassifisering separat fra operativ rolle |
| Fokuslogikk | `map/aircraft-focus-priority.js`, `map/focus-target.js`, `map/focus-motion-decision.js` | Skilt ut med regresjonstester; unngå endring i eksisterende score og manuell overstyring |
| Entur hurtigbåtruter | Worker `/speedboat` oppslag til Entur Journey Planner for Kristiansund hurtigbåtkai, separate rutetider i frontend | Entur-rutetid er ikke bevis for at et konkret MMSI seiler en konkret avgang; kobling krever verifikasjon |

## Foreløpig register – IKKE komplett flåtefasit

| Navn | Identitet | Kodeverifisert | Verifikasjon før produksjonsregel |
| --- | --- | --- | --- |
| EKSPRESSEN | MMSI **258416000** | Ja, frontend-ikon | Bekreft på gjeldende AIS og rute i faktisk drift |
| FJORDPRINSESSEN | Ikke fastsatt her | Ja, navn i Worker | Verifiser MMSI, gjeldende fartøynavn og samband |
| FJORDDRONNINGEN | Ikke fastsatt her | Ja, navn i Worker | Samme |
| TYRHAUG | Ikke fastsatt her | Ja, navn i Worker | Samme |
| TRONDHEIMSFJORD | Ikke fastsatt her | Ja, navn i Worker | Samme |
| TERNINGEN (kode inneholder også «TER NINGEN») | Ikke fastsatt her | Ja, navneuttrykk i Worker | Bekreft faktisk navn, alias og drift |
| TUSTNA – lokal ferge | MMSI **257087420**, IMO **9855393** | Ja, lav fokusprioritet | Ikke bland med Kystekspressen |
| Kystruteskip | Navnemønstre i Worker | Delvis | Verifiser navn/MMSI per skip før nytt register |

**Ikke bruk ubekreftede MMSI-er eller anta at disse navnene alle seiler Kystekspressen nå.** Det krever kildekontroll og faktiske AIS-observasjoner.

## Plan – gjennomføring i små trinn

1. **Fase A: Lesebasert flåtekontroll.** Kartlegg gjeldende Kystekspressen-båter (og reservebåter) med autoritative fartøyopplysninger, MMSI/IMO, alias og faktisk AIS-bevegelse langs Trondheim–Brekstad–Kristiansund. Merk tidligere fartøy som historiske når det er dokumentert.
2. **Fase B: Tester før refaktorering.** Lås eksisterende utfall i tester for EKSPRESSEN, TUSTNA, navnebasert hurtigbåt, kystrute, KSU-rutefly og spesialfly. Test feilidentifisering, manglende MMSI, bytte av rutefartøy, stillstand og kartsperre.
3. **Fase C: Utvidbar identitetsmodell.** Et deklarativt fartøyregister (MMSI/IMO/alias, trafikkgruppe og bevisnivå) og tilsvarende kategoriregler for fly. Behold identifisering adskilt fra visning og automatisk fokus. Støtt tilbakestillbar historikk ved navnebytte.
4. **Fase D: Kystekspressen først.** Ensartet ikon/navn for bekreftede fartøy. Kai-visning må være avgrenset til verifiserte, ferske AIS-observasjoner og hensynta geografisk dekning og CPU; ikke la stillestående fartøy aktivere automatisk fokus.
5. **Fase E: Andre grupper.** Kystruteskip, lokale ferger, rutefly og spesialfly migreres én gruppe om gangen, med før/etter-test på kartfokus, AIS- og ADS-B-kilder og API-forbruk.
6. **Fase F: Produksjonsbekreftelse.** Test faktiske fartøy underveis og ved kai, lufttrafikk ved KSU, mobilvisning, automatisk kartfokus og feilsituasjoner. GitHub-merge publiserer ikke Cloudflare Worker: deploy må være eksplisitt og verifiseres separat.

## Faste begrensninger

- Ingen nye posisjonskilder, polling-endringer eller ekstra API-kall som del av planleggingen.
- Behold én aktiv ADS-B-kilde, eksisterende 5 s pause etter flyoppdatering, AIS hvert 30 s og Avinor hvert 10 min slik de står i nåværende kode.
- FlightAware sentralt budsjett **USD 4,50 per måned** beholdes.
- Behold brukers manuelle kartstyring, stabilt KSU-fokus, AIS-sporhistorikk og båtsporing.
- Ikke gi stillestående fartøy automatisk kartfokus eller hent omfattende AIS-områder uten ressurs-/lastvurdering.
- Historikk beholdes, og usikkerheter dokumenteres i stedet for å gjettes.

## Åpne spørsmål og neste kontroll

- Hvilke fartøy og reserver betjener faktisk Trondheim–Kristiansund nå, og hva er sikre MMSI/IMO?
- Dekker dagens Kystverket-respons hele den aktuelle strekningen? Observer båter som seiler, ligger ved kai og bytter identitet.
- Hvilken ressurskostnad vil utvidet AIS-synlighet gi? Gjennomgå tidligere Cloudflare CPU-advarsel før endret geografisk uttrekk.
- Er det ønskelig at alle prioriterte fartøy får eget etikettikon, eller bare ved nærhet til Kristiansund? Dette er en senere presentasjonsbeslutning.

**Neste konkrete steg:** Utfør fase A som lesebasert kartlegging, og skriv karakteriseringstester for dagens regler før første produksjonsendring.
