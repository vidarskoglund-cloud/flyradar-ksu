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

## Fase A – kildebasert fartøykontroll 24.11.2026

**Omfang:** Offentlige kildeopplysninger, ikke ny live-spørring mot vår produksjons-Worker. Operatøren Norled bekrefter at de drifter rute 800 Trondheim–Kristiansund og 805 Trondheim–Brekstad på vegne av AtB: https://www.norled.no/rutetider-hurtigbat-og-ferje/trondelag/ .

**Viktig tidsendring:** En artikkel fra 13.–17.11.2026 om Norleds nye fartøydisponering melder at **VINGTOR og NJORD planlegges satt inn på Trondheim–Kristiansund i desember 2026**, og **FRØYA på Trondheim–Brekstad**. Dette er *planlagt* og må ikke registreres som allerede utført. Kilder:
- https://www.np.no/nyheter/nye-bater-usikker-fremtid/230283
- https://muckrack.com/pal-sundy/articles (gjengivelse av NT24/Tidens Krav, «Nye hurtigbåter på vei», 13.11.2026).

### Fartøy vi kan knytte til ruten eller det planlagte byttet

| Fartøy | MMSI | IMO | Kallesignal | Tidsstatus 24.11.2026 | Sikkerhet og kilder |
| --- | --- | --- | --- | --- | --- |
| **EKSPRESSEN** | **258416000** | **9481829** | LCBK | Historisk AIS-observert på rute 800 i 2026; brukes også i dagens frontend-markering | Havspor AIS-arkiv 27.07–15.09.2026; ikke verifisert som dagens fartøy: https://havspor.no/fartoy/ekspressen |
| **FJORDPRINSESSEN** | **259604000** | **9196735** | LJVE | AIS-observert på ruten i 2026 og omtalt ved Kristiansund i november; ikke garantert fast drift i dag | https://havspor.no/fartoy/fjordprinsessen , https://www.bronn.no/index.php/hurtigbater/fjordprinsessen |
| **VINGTOR** | **257151900** | **9616814** | LCNQ | **Planlagt** Trondheim–Kristiansund fra desember 2026 | Fartøyidentitet: https://globalfishingwatch.org/platform/vessel/49ab08bb0-0347-6edc-37b7-fc54c12e5b66 , https://shiptrail.io/vessel/257151900-vingtor . Ruteendring: nyhet over. AIS 23.11.2026 oppgitt ved Bergen, som *ikke* viser at flytting er gjennomført |
| **NJORD** | **257781000** | **9631539** | LCSU | **Planlagt** Trondheim–Kristiansund fra desember 2026 | Identitet: https://www.shipspotting.com/photos/3285545 og https://batomtaler.skipsrevyen.no/ms-froya-ms-njord/m/s-froya-m/s-njord/1106725 . Ikke forveksle med andre «Njord»-fartøy |
| **FRØYA** | **257605000** | **9616826** | LCNR | **Planlagt** Trondheim–Brekstad fra desember 2026 (rute 805), ikke automatisk rute 800 | Identitet: https://www.shipspotting.com/photos/3280398 , https://commons.wikimedia.org/wiki/Category:Fr%C3%B8ya_(ship,_2012) . Ruteendring: nyhet over |

**Kildegrense:** Fartøyenes MMSI/IMO/kallesignal er verifisert mot tilgjengelige eksterne fartøyprofiler, men *ikke* mot fersk Kystverket-AIS i denne gjennomgangen. Den operasjonelle listen per 24.11.2026 og planlagt omlegging i desember er to forskjellige ting. Faktisk iverksettelsesdato, reserver og alternative fartøy må fortsatt bekreftes. Norleds eksisterende rutetabell for Bergen i 2026 nevner VINGTOR, NJORD og FRØYA i Vestland; en planlagt overflytting er altså ikke en dokumentert fullført overflytting: https://www.norled.no/wp-content/uploads/2026/05/2026-Bergen-Sogn-Flam-Bergen.pdf .

### Historiske og ubekreftede treff

- **TYRHAUG** er bekreftet historisk rute-800-fartøy i Statens havarikommisjons rapport om hendelsen 28.06.2023; det er ikke bevis for at skipet seiler i 2026. https://nsia.no/Marine/Published-reports/2024-03?attach=1&pid=SHT-Report-ReportFile
- **LADEJARL** var tidligere Kystekspressen-fartøy, men nyere driftshistorikk sier overført til Fjord1/Vestland i 2025–2026. Ikke markér som aktivt Kystekspressen-fartøy: https://hsc-norway.no/ladejarl-2002.html .
- **TRONDHEIMSFJORD, TERNINGEN, FJORDDRONNINGEN** forekommer i eksisterende navnefilter, men aktiv tilhørighet og MMSI er ikke dokumentert i denne kontrollen. Behold som kandidater, ikke fastslått flåte.
- **TEISTEN** er avbildet ved Kristiansund i 2025, ikke bekreftet som aktivt fartøy 24.11.2026: https://www.np.no/nyheter/hun-horer-ikke-pa-folkets-vilje-vil-legge-ned-ruta/228271

### Konsekvenser for ny identitetsmodell

1. Registrer **MMSI/IMO** per skip som stabile identitetsnøkler, med tydelig `historisk`, `observert_2026`, `planlagt_desember_2026` og `bekreftet_aktiv` status. Ikke sett `bekreftet_aktiv` uten datert driftsbevis.
2. Registrer **rute 800 vs 805 separat**. FRØYA skal ikke identifiseres som Trondheim–Kristiansund bare fordi den går på rute 805.
3. VINGTOR/NJORD/FRØYA får ingen aktiv spesialmarkering før drift og AIS er verifisert etter fartøybyttet.
4. Test AIS-identifikasjon og kaivisning **uten** å gjøre ubegrensede /vessels-kall, øke Worker CPU-forbruk eller endre KSU-prioritet.
5. Dokumenter fartøybytter som tidslinje, ikke overskriv eldre flåtehistorikk.

**Status for fase A:** Fem relevante fartøysidentiteter med MMSI, IMO og kallesignal er kildekontrollert. *Komplett aktiv flåte, reservebåter og status for desemberendringen er ennå ikke verifisert.*

## Implementasjonsstatus – målrettet AIS-støtte for Kystekspressen (24.11.2026)

**Kildekode på egen gren:** `worker/src/index.js` inneholder et første register med fem dokumenterte MMSI-er, mens `app.js` gir EKSPRESSEN og FJORDPRINSESSEN samme tydelige ikon og eget fartøynavn. Dette beviser *ikke* at de er de eneste aktive fartøyene, eller at de har aktuelle avganger i dag.

**Kai-visning:** Workers filtreringsfunksjon `includeVesselInRadar()` har en begrenset unntaksregel for de to 2026-observerte rute-800-identitetene. Den krever (a) AIS-posisjon med gyldig tidsstempel fra siste 20 minutter, (b) innenfor 110 NM fra KSU, (c) gjenkjent MMSI eller navn uten en motstridende MMSI. Generiske og planlagte fartøy blir fremdeles filtrert bort ved under 1 knop. **Ingen ekstra AIS-oppslag** er lagt til.

**Fokus:** `movingHarborVessel()` er uendret; stillestående fartøy kan vises men tar ikke automatisk kartfokus. KSU-fly og manuell overstyring beholder eksisterende prioritet.

**Dekningsforbehold:** Worker henter uendret fra Kystverkets eksisterende AIS-endepunkt. Vi kan ikke garantere kai-visning eller hele strekningen hvis AIS-tidsstempelet/området ikke finnes i leverandørsvaret. Nettsidens `app.js` og Workers kildekode er to ulike produksjonskomponenter: **GitHub-merge deployer ikke Cloudflare Worker**. Denne kaifunksjonen er derfor ikke i produksjon før Worker er publisert separat og `/vessels` verifisert. Tidligere Cloudflare CPU-advarsel må undersøkes før eventuell utvidelse av geografisk uttrekk.

**Tester:** `tests/kystekspressen-ais.test.cjs` og `tests/featured-fast-ferry.test.cjs` gir regresjonsdekning for MMSI-kollisjoner, fersk/stale AIS, fart-/avstandsgrense, fremheving og adskilt planlagt vs. observert. Isolert beslutningstabell på 12 scenarier ble kontrollert. Full GitHub Actions-kjøring og live AIS-test krever separat verifisering.

**Neste:** Kontroller faktisk avgang, live AIS-dekning ved Trondheim/Brekstad/Kristiansund, CPU-feilrate og Worker-versjon. Deploy bare etter sammenligning med aktiv Worker-kode, med rollback til gjeldende deploy.
