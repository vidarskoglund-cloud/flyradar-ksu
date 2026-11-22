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

## Oppdatering – 22.11.2026: rolig visning av fjerntrafikk
- [PR #28](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/28) er slått sammen i `main` (commit `56aa51fdfd7ff8c910d6ef40216c6a771043ae69`).
- Når ingen kvalifiserte KSU-fly eller bevegelige prioriterte AIS-fartøy krever kartfokus, vises vanlig Kristiansund-oversikt før et kort glimt av nærmeste aktive fly mellom 25 og 120 NM. Glimtvindu: sekund 60–75 i en 90-sekunders syklus. Deretter tilbake til oversikt. Signaltapte fly er utelukket.
- Flypanelet har «Vis fly på kart», som viser Kristiansund og valgt fly og låser manuell visning i to minutter.
- 30 sekunders fokusbyttelås, to minutters manuell pause, KSU/AIS-prioritet, ADS-B-kilde, ruter og varsler er beholdt.
- GitHub Actions syntakskontroll og nye karttester besto. Eldre `motion.test.cjs` har tidligere kjente feil som fortsatt kjøres separat uten å blokkere ny kart-CI.
- **Gjenstår:** Kontrollere GitHub Pages-utrulling og observere faktisk kartbevegelse over en full 90-sekunders syklus med og uten lokal trafikk. PR #25 (skipsdetaljer) er fortsatt utenfor.

## 22.11.2026 – Automatisk valg av skip i havneområdet
- [PR #29](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/29) er slått sammen i `main` (commit `31d91c85022f5c96d9f14ffd26692200e355e53e`).
- Når AIS-basert kartprioritering velger et fartøy som faktisk beveger seg nær Kristiansund havn, velges samme fartøy automatisk i høyrepanelet; flykortet skjules mens fartøykortet vises.
- Krever observert AIS-posisjonsendring, minst 1,5 knop og fersk posisjon. Automatisk skifte mellom fartøy skjer tidligst etter 30 sekunder; manuelle skipsvalg beholder kontroll i to minutter.
- Når prioritert KSU-fly overtar, returnerer høyrepanelet til flyvisning. Fly-/AIS-kilder, oppdateringsfrekvens, varsler og gjeldende kartzoomlogikk er ikke endret.
- GitHub Actions-testene for kartfokus besto. **Gjenstår:** verifisere faktisk automatisk skipsvalg i publisert GitHub Pages med levende AIS-oppdateringer; skip trenger minst to ulike posisjoner før automatisk valg.
- Urelatert [PR #25](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/25) om ytterligere skipsopplysninger og bildeoppslag er fortsatt separat og ikke innført i denne endringen.

## 22.11.2026 – Automatisk bildeoppslag for fly og skip
- [PR #30](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/30) er slått sammen i `main` (commit `84fc113d6f166ab6670932953d173158d7570e99`).
- Fly: `aircraft-photos.js` gjør automatisk Wikimedia Commons-oppslag etter registreringsnummer. Bare nøyaktig identifisert registrering vises som individuelt foto; ved nulltreff vises eksisterende typefoto/illustrasjon.
- Skip: `vessel-photos.js` søker IMO, MMSI og skipsnavn i denne rekkefølgen, med restriktiv filnavnsmatching. Treff som bare er basert på navn merkes «Mulig bilde»; ellers generisk skipsillustrasjon.
- Fotoresultater caches lokalt i nettleseren (7 dager ved treff, 1 dag ved nulltreff), og kilde/fotograf/lisens vises.
- Skipskortet viser også fart, kurs og AIS-tid når kjent. `worker/src/index.js` viderefører valgfrie IMO-/lengde-/breddefelt når upstream leverer dem. **Cloudflare Worker er ikke bekreftet publisert med ny kode; slike felt må ikke fremstilles som live-verifiserte.**
- GitHub Actions syntakskontroll og nye bilde-/karttester besto. **Gjenstår:** bekrefte oppdatering av GitHub Pages, teste faktiske Commons-funn/feiltilfeller for fly og skip, og kontrollere Worker-utrulling separat.
- Eldre [PR #25](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/25) inneholder overlappende endringer og skal ikke slås sammen uten ny gjennomgang.

## 22.11.2026 – Ryddet fly-/skipskort og skipsfoto
- [PR #31](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/31) slått sammen i `main` (commit `9a7fdcf3a1df5374375435be8520f873b0fdc999`).
- Rettet bekreftet UI-feil fra skjermbilde: CSS for `.cards` overstyrte HTML `hidden` slik at WIF459 fremdeles vistes under overskriften «Fartøy ved Kristiansund havn». `#cards[hidden]` skjules nå eksplisitt, og fartøykortet viser WATERLORD eller annet valgt fartøy som hovedobjekt med navn, fart, kurs og AIS-detaljer.
- Kartmarkør for automatisk/manuelt valgt skip får synlig markering, oppdateres etter AIS-refresh og fjernes ved skifte til fly. Manuelt flyklikk viser flykortet og overstyrer automatisk skipsvalg i to minutter.
- Fartøykortet oppdaterer AIS-verdier uten å gjenskape fotoelementet hvert 30. sekund, slik at bilder ikke blinker eller avbrytes.
- Skipsbildet beholdes som illustrasjon til et verifisert Commons-foto faktisk har lastet. Ved manglende sikkert treff vises forklaringen «Fant ikke et sikkert skipsfoto i Wikimedia Commons». Negativ bildecache er fornyet (v3).
- GitHub Actions syntakskontroll, kart-, bilde- og nye fartøypaneltester besto. Gamle feil i `motion.test.cjs` er fremdeles separat/ikke bekreftet løst. **Gjenstår:** live nettlesertest av GitHub Pages, AIS og foto. Et foto av WATERLORD er funnet på annen nettside, men kan ikke automatisk brukes som fritt lisensiert bilde uten rettighetsavklaring.
- ADS-B, AIS-kilder, Worker, varsler og kartzoom er ikke endret.

## 22.11.2026 – Flystatus og kartknapp
- [PR #32](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/32) slått sammen i `main` (commit `f0bf8bd513c9299b09ccc9575fdb319b70d44152`).
- «Vis fly på kart» vises bare når valgt fly er utenfor gjeldende kartutsnitt. Synligheten oppdateres ved kartbevegelse, flyvalg og interpolert posisjon; manuell kartpause og markering av valgt fly beholdes.
- Status «Nærmer seg KSU» vises ikke lenger kun på bakgrunn av kurs/avstand for et høytflygende passerende fly, som WIF2U (40 025 ft / 43 NM). Ubekreftet fjerntrafikk vises som «Passerer regionen». Bekreftet KSU-destinasjon vises som «På vei til KSU» og mulig innflyging som «Mulig innflyging mot KSU» bare ved flere relevante bevegelsestegn.
- GitHub Actions med syntaks-, kart-, bilde-, skips- og nye flystatus-/knappetester besto. Tidligere feil i `motion.test.cjs` fortsatt separat. **Liveverifisering:** hovedgrenen er kontrollert; publisert Pages og praktisk test med live fly gjenstår.
- Fly-/AIS-kilder, oppdateringsintervaller, båtsporing og varsling er ikke endret.

## 22.11.2026 – Gratis pilot for automatisk rutekontroll innen 25 NM
- [PR #33](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/33) slått sammen i `main` (commit `3c35029a2de0f07095760e396f295f5ab8b0bcfa`).
- Når et ferskt fly med flynummer er innen 25 NM fra KSU, forsøker nettleseren automatisk et ruteoppslag via Worker med `fa_scope=pilot25-free`. Dagens Worker gir **ikke** tilgang til betalt FlightAware for denne verdien: bare gratis adsb.lol forsøkes. Manglende flynummer kan ikke oppslås på denne måten.
- Maks ett nytt flynummer per UTC-dato per nettleser, ett nytt oppslag per 15 sekunder og 120 forsøk per dag. Positiver mellomlagres i eksisterende rutehistorikk.
- Egen teller i `admin.html` viser dagens forsøk, rutetreff, ingen rute, feil og testens betalte API-kall/estimerte kostnad (0 USD). Denne telleren er **lokal per nettleser**, ikke et autoritativt globalt regnskap.
- Eksisterende FlightAware-status på administrasjonssiden viser betalt forbruk fra Worker/leverandør. Worker-koden håndhever en separat 4,50 USD per måned intern reservasjon, faktisk forbrukskontroll og avvisning ved manglende leverandørstatus. Dette er en sikkerhetsmargin mot målet under 5 USD, **ikke garanti om samlet plattformfaktura**.
- GitHub Actions syntakskontroll, kostnadssikkerhets- og kartregresjonstester besto. Eldre kjente motion-testfeil kjøres separat. **Gjenstår:** kontrollere live Worker-versjon og faktisk gratis 25 NM-ruteoppslag, teller og rutetreff i nettleser etter Pages-utrulling. Før betalte pilotkall eventuelt vurderes, må globalt og faktisk USD-forbruk kontrolleres og ny endring godkjennes.
- ADS-B-kilde, AIS, kartprioritering og varsler er uendret.

## 22.11.2026 – Prosjektstatus synlig på administrasjonssiden
- [PR #34](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/34) ble slått sammen i `main` (commit `83566d783e86a3cedf0ebe8b0835995da809e0e6`).
- `admin.html` har en egen datert seksjon «Prosjektstatus» med siste implementerte endring (#33), automatisk teststatus, åpne livekontroller og lenker til PR-er/denne overleveringen. Driftsdiagnostikk og nettlesertellere er fortsatt adskilt fra prosjektstatus.
- Seksjonen er en manuelt oppdatert oppsummering ved kode-/dokumentasjonsendringer, ikke automatisk synkronisering fra chattens innhold. Denne START-HER.md er den detaljerte autoritative overleveringen.
- Prosjektseksjonens innhold er kontrollert i GitHub `main`. Publisering på GitHub Pages er ikke nettleserverifisert.

## 22.11.2026 – Datakilder organisert på administrasjonssiden
- [PR #35](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/35) slått sammen i `main` (commit `893c751f5e7c55c351c9f6395579556b9c7167f2`). Oppfølgende prosjektstatusoppdatering i `admin.html`.
- Administrasjonssiden viser nå aktiv flyposisjonskilde først: `adsb.fi` via lokal Flyradar-server (15 sekunder), med lokal tilgjengelighetsstatistikk og siste vellykkede posisjonsoppslag.
- Ruteoppslag er separat: gratis `adsb.lol` via Cloudflare Worker for 25 NM-piloten (#33); eventuell betalt FlightAware-fallback kun for andre kvalifiserte oppslag med eksisterende sikkerhetsgrense på 4,50 USD per måned. Den automatiske piloten tillater ikke betalte fallback-kall.
- Worker, adsb.lol og Airplanes.live vises under **inaktive flyposisjonskilder**, ikke som feilende tjenester. Worker brukes fremdeles til ruter og AIS; `adsb.lol`-posisjonsmåleren er ikke en indikator for rutetjenesten.
- En enkel visuell flyt: adsb.fi → Trafikkradar kart/varsler → gratis ruteoppslag for kvalifiserte fly innen 25 NM.
- Eksisterende statushistorikk, kostnadstall, AIS og manuell API-diagnose er beholdt. Misvisende «Worker-tilgjengelighet» er endret til «Worker brukt til flyposisjoner» og viser «Ikke brukt» når slike målinger mangler.
- GitHub Actions regresjons- og syntakstester besto for PR #35. Live publisering på GitHub Pages er ikke verifisert i nettleser. Ingen endring i fly- eller skipskilder eller sporingsfunksjon.

## 22.11.2026 – Fartøykontekst og presisering av 25 NM-testens budsjett
- [PR #36](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/36) slått sammen i `main` (commit `b7182ff01ad71d87f8723ddba61d6dc2da219a23`).
- Fast overskrift «Fartøy ved Kristiansund havn» var misvisende for passerende fartøy (eksempel KRYSSHOLM, MMSI 257041670, IMO 9579468, AIS-destinasjon FISHFARMS). Ny `vesselMovementContext` bruker observert avstand og trend fra to AIS-posisjoner ved havneområdets referansepunkt: «Fartøy i havneområdet», «Fartøy nærmer seg havneområdet», «Fartøy beveger seg bort fra havneområdet» eller nøytral «Fartøy i farvannet ved Kristiansund». Dette sier **ikke** at skipet skal anløpe havnen; en statuslinje presiserer forbehold. Statisk overskrift er fjernet for både manuell og automatisk valgt fartøy.
- Feltet «Destinasjon» er presisert til «Oppgitt AIS-destinasjon»; verdier som FISHFARMS skal ikke tolkes som bekreftet havneanløp. Endring i overskrift og opplysning skjer ved nye AIS-data uten å nullstille skipets foto.
- `admin.html` forklarer nå nøyaktig: gratis automatisk 25 NM-rutetest for fly med flynummer, maks ett forsøk per UTC-dato/flynummer per nettleser, minimum 15 sekunder mellom nye forsøk og maks 120/dag. Kjente mellomlagrede ruter krever ikke nye kall. Teller er nettleserlokal.
- Betalt FlightAware-fallback brukes **ikke** i pilotens `pilot25-free`-scope, men kan gjelde andre kvalifiserte oppslag. Eksisterende Worker-kode har intern 4,50 USD/måned-reservasjon og faktiskforbrukskontroll; dette er ingen garanti om samlet faktura under 5 USD. Faktisk utrullet Worker-versjon er fortsatt ikke kontrollert.
- GitHub Actions syntaks-, kart-, skip-, bildestatus-, pilot-, administrasjons- og nye regresjonstester besto etter oppdatering av eldre tester som forventet fast skipsoverskrift. Øvrig sporingslogikk, prioritering, Worker/AIS/ADS-B, fotokilder og kostnadspolicy er uendret.
- **Åpent:** Verifiser live GitHub Pages og overskrift for skip med faktisk inn-/utgående AIS-bevegelse og ruteteller/Worker i nettleser.

## 22.11.2026 – Forbedret søk etter skipsbilder i Wikimedia Commons
- [PR #37](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/37) slått sammen i `main` (commit `f2965567f371ddbf9ee19e803f39ef9877bb5faf`).
- Bildeoppslaget prøver fortsatt IMO/MMSI først, men søker deretter etter «<skipsnavn> ship», «<skipsnavn> vessel» og skipsnavnet alene. Utvidet søket til flere bilder per søk og leser kategori-/beskrivelsesmetadata fra Commons.
- Tidligere ble relevante bilder med kun navn og årstall i filnavnet ofte avvist; nå kan maritim kategori bekrefte konteksten. Kandidater med eksakt IMO eller MMSI prioriteres foran treff på navn. Navnetreff uten slik ID vises fortsatt tydelig som «Mulig foto».
- Søket krever gjenbrukbar Wikimedia-lisens; CC-NC og CC-ND avvises. Fotograf, lisens og Commons-kilde krediteres. Ingen bilder hentes automatisk fra søkemotorer eller andre nettsteder med uklar lisens.
- Negativ bildecache endret til v4 så eldre «ingen treff» ikke hindrer nytt søk. Egne regresjonstester for bildetitler, Commons-kategorier, eksakt IMO og forvekslingsfare besto i GitHub Actions.
- **Gjenstår:** Test faktisk søk på publisert nettside og verifiser bildet visuelt mot det konkrete fartøyet. Navnet «hiosfjord» brukt som eksempel i samtalen er ikke bekreftet som identisk med et bestemt Commons-fartøy. Ingen endringer i AIS, flydata, Worker eller kostnader.

## 22.11.2026 – Flere skipsopplysninger fra Wikidata (PR #38)
- [PR #38](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/38) er slått sammen i `main` (commit `11d3fae42d1eac94f0dae4d0da304b24ed842c00`). GitHub Actions-kontroll for PR-hodet ble fullført med `success`.
- Valgt skipskort har en ny, egen seksjon «Flere skipsopplysninger · Wikidata». Viser skipstype (P31), operatør (P137), registreringsland (P8047) og tatt i bruk-år (P729), dersom disse feltene finnes. En lenke leder til den eksakte Q-posten.
- Søket gjøres fra nettleseren mot Wikidata Query Service: først eksakt IMO (P458), deretter MMSI (P587) hvis første oppslag ikke ga et entydig treff. Det brukes **aldri navnetreff alene**. Motstridende IMO/MMSI avvises og flere mulige Q-poster fører ikke til automatisk valg.
- Resultater lagres lokalt i nettleseren i 7 døgn, negative treff i 1 døgn, og parallelle oppslag for samme identifikator dedupliseres. Oppslag skjer ved valg av fartøy, ikke for alle AIS-objekter i hver oppdatering.
- Dynamisk AIS fra Kystverket (posisjon, kurs, fart, AIS-destinasjon, lengde/bredde) er uendret og atskilt fra potensielt ufullstendige/utdaterte Wikidata-opplysninger. Ingen MarineTraffic-data brukes, ingen betalte API-er eller Worker-endringer.
- **Kontrollstatus:** JavaScript-syntaks og regresjonstester for identitet, flertydighet og tilleggsvisning besto. Åpent: faktisk oppslag/visning via Wikidata API og GitHub Pages etter utrulling; offentlig Wikidata-tjeneste kan ha tilgjengelighetsbegrensninger og endringer.

## 22.11.2026 – Kompakt statuslinje i desktopvisningen
- [PR #39](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/39) er slått sammen i `main` (commit `0a92f529b387c6a96ea0141fcb76cfcbee042fdd`).
- Desktop (vanlig nettlesermodus >= 900 px): `#vessel-live-status` vises i venstre del av første rad over kartet, mens `#stats` med antall fly innen 50 NM, nærmeste med signal og siste oppdatering vises kompakt i høyre kolonne. Tre store kort over hele siden er fjernet fra desktop-oppsettet, slik at mer høyde frigjøres til kartet.
- Fullscreen og mobil får uendret layout. Eksisterende id-er og automatiske statistikkoppdateringer, AIS-felt, kart, skip/fly-kort og funksjoner er beholdt. Ingen endringer i datakilder eller oppdateringsintervaller.
- Nye tester og hele GitHub Actions-kjøringen besto på PR #39.
- **Åpent:** Visuell kontroll på publisert GitHub Pages ved brukerens PC-oppløsning. Dette er første trinn i å minimere rulling; hele desktop-sidens høydedisponering og behovet for scrollbar er ennå ikke verifisert/fjernet på alle skjermstørrelser. Ikke skjul viktig informasjon eller snarveier for å fjerne scrollbar.

## 22.11.2026 – Desktopvisningen tilpasses vindushøyden (PR #40)
- Skjermbilde fra bruker viste fremdeles global vertikal scrollbar etter PR #39. Årsaken i CSS var at kartet fikk høyde basert på hele skjermhøyden mens header, kompakt statustripel, innstillinger og footer fortsatt krevde plass.
- [PR #40](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/40) slått sammen i `main` (commit `653fba561964fbb376b38ab6ab8a7ca2dcc32f4f`). Vanlig desktop-nettleser i minst 900×640 piksler får nå en viewportbundet grid: header, fleksibel kart-/panelrad og synlig kildefooter. Kartet bruker tilgjengelig gridhøyde uten kunstig 100vh-basert minstehøyde.
- Høyrepanelet kan rulle *internt* dersom fly-, skip- eller Wikidata-informasjonen er større enn tilgjengelig plass. Varsler og lyd forblir tilgjengelige, også ved åpning; lange detaljer klippes ikke bevisst. Fullscreen og mobilregler er ikke endret.
- CI syntaks-, layout- og regresjonstester besto for PR #40. **Praktisk verifikasjon gjenstår:** Bekreft at vertikal siderulling er borte på brukerens PC ved vanlig desktop-visning, og at all viktig informasjon fortsatt er tilgjengelig.

## 22.11.2026 – Tydeligere Avinor-panel for Kvernberget
- [PR #41](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/41) slått sammen i `main` (commit `5b77b1b705c3a0245c86edeee6e4dbc7b4c82b1a`).
- Paneloverskriften i både hoved-/sidevisning er endret fra «Neste på KSU» til «Flyavganger og ankomster · KSU» for å tydeliggjøre at begge flyretninger vises.
- Rader med Avinors normale planlagte tid merkes «Planlagt». Bare når `status_code=E` og en gyldig `status_time` avviker med minst ett minutt fra `schedule_time`, merkes klokkeslettet «Ny tid», og opprinnelig planlagt klokkeslett vises i en liten linje. En senere tid gir «Forsinket»; en tidligere tid gir «Tid endret». Ingen generisk «Ny tid»-merking for alle fly.
- Fly som er landet/avreist eller mer enn 30 minutter forbi oppgitt tid, vises ikke. Inntil fire kommende flyvninger vises. Fly med sikker aktiv KSU-kobling i ADS-B får prioritet i listen og får «Følges nå» samt avstand fra KSU når tilgjengelig; øvrige sorteres kronologisk. Avlyste fly vises merket «Innstilt» så lenge de ligger innenfor tidsvinduet.
- Avinor JSON-fil, innhentingsintervall (10 minutter), datafangst og fly-/skipskilder er uendret. Relevante automatiserte tester og CI kjørte med `success`.
- **Åpent:** Kontroll av faktisk publisert visning på PC, særlig små sidepanel og håndtering av ufullstendige statusfelt i reelle Avinor-data.

## 22.11.2026 – Automatisk kartutsnitt for fokusert fly (PR #42)
- [PR #42](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/42) er slått sammen i `main` (commit `8e16ac846824fb87296b2d18a3a9b77d85cc6015`).
- Fjernet «Vis fly på kart»-knappen med tilhørende HTML/CSS, klikkhendelse og gjentatt kontroll i animasjonsløkka. Den var en manuell løsning når flyet vist i informasjonspanelet lå utenfor kartet.
- `fitMap` utvider nå automatisk kartets målgrenser med posisjonen til flyet i informasjonspanelet dersom det har aktivt signal og befinner seg utenfor det vanlige målutsnittet. Kartet zoomer ut til et område som viser både det valgte flyet og de øvrige lokale fokusmålene, fremfor å be bruker trykke knapp.
- Hvis flyet ikke er synlig, kan dette overstyre vanlig automatisk rezoom-cooldown og ventetiden før retur til normalvisning. Automatisk zoom skjer fortsatt **ikke** under den etablerte pausen på to minutter etter manuell zoom/panorering. Ved mistet signal utvides ikke utsnittet på grunn av den gamle flyposisjonen. Skip/KSU-prioritering, bevegelsesinterpolering, datakilder og API-intervaller er beholdt.
- Testene ble tilpasset knappfri løsning. Ny simulert Leaflet-test kontrollerer utvidelse av kartgrensene, fly som allerede vises, signalbortfall og manuell pause. GitHub Actions var `success` ved sammenslåing.
- **Åpent:** Verifiser på publisert GitHub Pages at fokusert fly er synlig ved endret avstand og at zoomanimasjon ikke gir unødig hopping i reell trafikk. Ingen nettleserverifisert publisering.

## 22.11.2026 – Toppstatus beskriver faktisk kartfokus (PR #43)
- [PR #43](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/43) er slått sammen i `main` (commit `1a12b9755d4f0fe851557979d1f702e307c0c52d`).
- Tidligere kunne toppstatus si «0 fly innen 50 NM · følger SAS1326» mens kart og høyrepanel viste fartøyet HOPSFJORD. Årsak: statusen ble skrevet ut fra siste prioriterte/valgte fly, ikke kartets `smartMapTarget`.
- Statusen bygges nå av aktivt automatisk kartmål: «Følger fartøy NAVN» for `bat:<id>`, «Følger fly IDENTIFIKATOR» for `fly:<id>`, «Viser fly IDENTIFIKATOR» for korte fjernflyglimt, ellers «Oversikt Kristiansund». Når bruker styrer kartet manuelt (to minutters pause), vises «Kartvisning valgt manuelt» i stedet for en falsk «følger»-påstand.
- Antall fly innen 50 NM er fjernet fra toppteksten fordi det allerede vises i statistikklinjen. Toppstatus har klokkeslett. Fullskjermstatus oppdateres sammen med vanlig header.
- Ved ADS-B-feil beholdes eksisterende tydelig beskjed om feil eller sist kjente data, ikke falsk kartfokus-status. Eksisterende kartvalg, kildeprioritering, autozoom, AIS-oppdateringer og kostnadsoppsett er uendret.
- Automatiske tester for fly, fartøy, tomt kartmål, manuell styring, eldre data og oppdatering ved `render` ble lagt til. Eldre karttest for manuell zoom ble oppdatert og GitHub Actions besto for PR #43.
- **Åpent:** Praktisk kontroll på publisert nettside ved skifte mellom fartøy, fly, oversikt og manuell kartstyring.

## 22.11.2026 – Unngå teknisk rutepolicy i flykort (PR #44)
- Brukerens skjermbilde viste NOZ417 (55,7 NM) med «Rute ikke tilgjengelig» og «Ikke kvalifisert for ekstra ruteoppslag». Sistnevnte var intern rutekvalifisering (utenfor gratis 25 NM- og valgt fly innen 50 NM-området), ikke informasjon om flyvningens rute. Teksten var misvisende og tok unødvendig mye plass.
- [PR #44](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/44) er slått sammen i `main` (commit `742a1251499610b940fc4c31b60b5c24134fb706`). Manglende rute uten forsøk vises nå som **én** nøktern linje «Avgang og destinasjon ikke bekreftet». Hvis oppslag faktisk kjøres: «Søker etter flyrute…», «Ingen bekreftet rute funnet» eller «Ruteinformasjon midlertidig utilgjengelig» ut fra tilstand. Ingen tekniske leverandør- eller prissperredetaljer i flykortet.
- Faktisk oppslag/treff for NOZ417 er **ikke** verifisert, og vi påstår ingen bestemt avgang/destinasjon uten data. Eksisterende grense for betalte ruteoppslag, gratis 25 NM-test, kilder, autozoom, kartprioriteter, fly-/skipssporing er **uendret**.
- Egne tester for offentlig rutetekst, oppslagstilstander og bevart rutepolicy er lagt til. GitHub Actions besto for PR #44.
- **Åpent:** Kontroller kortet visuelt på publisert nettside, og vurder separat om vi ønsker flere gratis ruteoppslag for viste fly utenfor 25 NM. Dette skal ikke utvide betalt tilgang uten særskilt beslutning.

## 22.11.2026 – Hurtigbåtrute for Kristiansund under flytidene
- [PR #45](https://github.com/vidarskoglund-cloud/flyradar-ksu/pull/45) er slått sammen i `main` (commit `3ba355b5d26ee77c87c18c8774627033c51a1dfb`).
- Under «Flyavganger og ankomster · KSU» vises nå eget kompakt felt **«Hurtigbåt · Kristiansund»** for AtB hurtigbåtrute **800** (Trondheim–Brekstad–Hitra–Kristiansund), med inntil fire kommende avganger og ankomster fra Kristiansund hurtigbåtkai.
- Ny uavhengig frontend-modul `speedboat-schedule.js` oppdager kaia ved Enturs Geocoder v3 med navne-/koordinatsjekk og slår opp `stopPlace.estimatedCalls` i Journey Planner v3. Enturs `ET-Client-Name` er `vidarskoglund-trafikkradar`; forespørslene går direkte fra nettleseren med 10-minutters intervall, ikke via Cloudflare Worker. Ingen nytt betalt API.
- Viser kun rute 800, utelukker innstilte/allerede gjennomførte avganger, skiller **planlagt** fra **revidert sanntid**, og merker forsinkelse først ved reell senere forventet tid. Kompakt desktopversjon ligger i høyrepanelet; separat felt etter Avinor er laget for mindre skjermer.
- Rutetabellen beskriver **linjen**, ikke hvilket bestemt AIS-fartøy som kjører en gitt avgang. Verken TRANEN eller annet skip knyttes til en bestemt rutetid uten dokumentert kobling. AtB/Entur kilde vises i panelet.
- Eksisterende AIS, Avinor, flyradar, automatiske kartfunksjoner og kostnadskontroll ble ikke endret. Nye enhetstester for planlagt/sanntid, rute 800-filter, identifikasjon av kaia og visningsplassering besto i GitHub Actions.
- **Åpent:** Verifiser live-nettleserkall mot Entur Geocoder og Journey Planner fra GitHub Pages, at korrekt kai returneres og at faktiske avganger vises. Hvis kilde utilgjengelig vises tydelig feilmelding; ingen rutetider er oppdiktet. Dette er kode/CI-verifisert, men ikke verifisert mot faktisk respons fra Entur.
