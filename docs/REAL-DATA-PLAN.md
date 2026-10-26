# Real Oman facilities — data plan

Locations come from OpenStreetMap (mapped from satellite imagery) unless noted.
Specs come from Global Energy Monitor (GEM). Nothing here is operator data:
no SCADA, no production figures from the operators.

## Facilities (proposed sites)

| # | Facility | Operator | Type | Lat, Lng | Source |
|---|----------|----------|------|----------|--------|
| 1 | Khazzan CPF (Block 61) | BP | Gas processing | 21.6611, 56.4107 | OSM "BP Khazzan CPF" |
| 2 | Saih Rawl gas complex | PDO | Gas processing | 21.3601, 56.7319 | OSM (PDO power plant inside the complex) |
| 3 | Qarn Alam | PDO | Oil production hub | 21.2958, 57.0985 | OSM |
| 4 | Fahud | PDO | Oil field + gas compressor hub | 22.3205, 56.4361 | GEM |
| 5 | Yibal | PDO | Oil & gas field | ≈22.20, 56.03 | OSM (airport, approx.) |
| 6 | Lekhwair | PDO | Oil field | 22.8423, 55.4021 | OSM |
| 7 | Safah gas plant (Block 9) | Occidental | Gas processing | 23.1905, 55.4601 | OSM |
| 8 | Mukhaizna (Block 53) | Occidental | Heavy-oil field | 19.3384, 56.4794 | OSM |
| 9 | Mabrouk | PDO | Gas field | 21.2449, 56.3465 | OSM |
| 10 | Nimr | PDO | Oil field | 18.5564, 55.8617 | OSM |
| 11 | Amal | PDO | Heavy-oil field | 18.3335, 55.6860 | OSM |
| 12 | Marmul | PDO | Oil field | ≈18.14, 55.18 | OSM (airport, approx.) |
| 13 | Oman LNG, Qalhat (Sur) | Oman LNG | LNG export terminal | 22.6599, 59.4063 | OSM |
| 14 | Duqm refinery | OQ8 | Refinery (230 kb/d) | 19.7323, 57.6591 | OSM / Climate TRACE |
| 15 | Sohar refinery & port | OQ | Refinery / petrochemicals | ≈24.49, 56.61 | OSM (port, approx.) |
| 16 | Mina Al Fahal | OQ | Refinery + crude export terminal | 23.6231, 58.5182 | OSM (area) |

"≈" = position of a nearby mapped feature, to be refined.

## Pipelines (OQ Gas Networks, gas)

| Line | Length | Diameter | Since | Endpoints |
|------|--------|----------|-------|-----------|
| Saih Rawl – Sur (Oman LNG) | 360 km | 48" | 2000 | Saih Rawl → Al Kamil → Qalhat |
| Fahud – Sohar (main) | 300 km | 32" | 2004 | Fahud → Sohar |
| Khazzan – Saih Nihayda | 60 km | 36" | 2017 | Khazzan CPF → Saih Nihayda |
| Saih Rawl – Fahud | ≈96 km | — | 1999 | Saih Rawl → Fahud |

Exact routes are not public: lines are drawn through their real endpoints and
known towns, and are labelled "approximate route".

## Not available from public sources
- Live pressure / flow / temperature (needs the operator's SCADA or our own field devices)
- Incidents, permits, staff, contractors — these must come from the client's own records

Sources: openstreetmap.org (ODbL), gem.wiki (CC BY-SA), climatetrace.org.
