# Drifts- og publiseringskontroll – fase 1 (#18)

**Opprettet:** 24.11.2026. **Status:** Sjekkliste, ikke en attest på at live-testene er gjennomført.

## Før endring

- [ ] Noter `main`-commit/SHA og den siste bekreftet fungerende versjonen.
- [ ] Les `START-HER.md`, `docs/SYSTEMOPPSETT.md` og relevant issue.
- [ ] Avklar om endringen gjelder **kun Pages**, **kun Worker** eller **lokal Windows/Tailscale**. De publiseres og testes separat.
- [ ] Ta vare på eventuelle feilmeldinger og gjeldende kildestatus før tiltak.

## Sjekk i kode / test

- [ ] Kontroller JavaScript-syntaks for berørte filer.
- [ ] Kjør relevante `tests/*.test.cjs` i Node og noter resultat (ikke marker bestått ved manglende kjøring).
- [ ] For kartfokus: test KSU-fly på bakken, innflyging, valgt fly ca. 51,5 NM unna, fly utenfor 100 NM, manuell panorering og fokus på bevegelig fartøy.
- [ ] For ruter: test callsign uten datoprefiks, en kjent rute, ugyldig rute, manglende rute og sletting/utløp av cache.
- [ ] Kontroller at kilder, intervaller, FlightAware-kostgrenser og AIS-logikk ikke har endret seg utilsiktet.

## Etter publisering – Pages

- [ ] Kontroller at GitHub Pages-bygg og utrulling er vellykket, og noter commit.
- [ ] Åpne https://vidarskoglund-cloud.github.io/flyradar-ksu/ og kontroller at fly faktisk tegnes med tidsstempel/kildestatus.
- [ ] Kontroller `data/avinor-ksu.json`: `generated_at`, gyldig struktur og oppdatert tidspunkt.
- [ ] Kontroller flydetaljer, avgang/destinasjon, kartzoom, innstillinger, mobilvisning og manuell overstyring.
- [ ] Observer minst én reell flybevegelse og kartfokus. Ingen trafikk er ikke i seg selv en feil i integrasjonen.

## Etter publisering – Cloudflare Worker (bare ved Worker-endring)

- [ ] Bekreft egen Worker-deploy; en merge i GitHub beviser ikke deploy.
- [ ] Test `/health`, `/aircraft`, `/route` og AIS-/vær-endepunkter der de er berørt.
- [ ] Kontroller feilstatus og kostnader før nye API-oppslag.
- [ ] Bekreft at båtsporing virker uavhengig av eventuelle ADS-B-feil.

## Lokal server og varsler

- [ ] Kontroller Windows-oppstart, eventuell planlagt oppgave, lokal tjeneste og Tailscale-tilgang etter restart.
- [ ] Test ADS-B-dekning og hvordan ferske/gamle posisjoner vises ved bortfall.
- [ ] Test 50 NM-varsel, lyd og avvist nettlesertillatelse; noter mobilbegrensninger for bakgrunn/låst skjerm.
- [ ] Verifiser 30-minutters lokalt flyspor over refresh og ved signaltap.

## Feil og tilbakeføring

1. Stans nye endringer dersom fly, AIS eller kart blir ustabilt.
2. Noter tidspunkt, brukerobserverte symptomer, berørt endepunkt, relevant commit og gjeldende status.
3. For **Pages**: tilbakefør relevant merge/commit via egen PR, la Pages bygge på nytt, og test siden.
4. For **Worker**: vurder tidligere fungerende Worker-versjon separat, og bekreft deploy/helse etterpå.
5. For **lokal server**: bruk dokumentert tjeneste- og oppstartsprosedyre; ikke anta at GitHub-tilbakeføring endrer lokal server.
6. Dokumenter faktisk resultat og åpne avvik i issue #18.

## Verifikasjonslogg

| Dato | Miljø | Kontroll | Resultat | Kilde/bevis |
| --- | --- | --- | --- | --- |
| 24.11.2026 | GitHub-kode | Gjennomgang av kildebeskrivelse og polling | Kodeobservert, ikke live-testet | `app.js`, `docs/SYSTEMOPPSETT.md` |
| 24.11.2026 | Ekstern live-tilgang | Forsøk på Pages, Worker `/health` og Avinor JSON | Ikke tilgjengelig fra kontrollmiljø; resultat ukjent | Kontrollen kunne ikke fullføres |

**Neste steg:** Kjør faktisk test på publisert side og maskinen med lokal ADS-B/Tailscale, og noter målte resultater her og i issue #18. Først deretter større kodeoppdeling (#19).
