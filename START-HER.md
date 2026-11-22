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
