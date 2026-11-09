# FLOW 8 – BLE protokol (vlastní zjištění, 7. 11. 2026)

Navazuje na komunitní výzkum v [abelroes/flow-8-midi](https://github.com/abelroes/flow-8-midi)
(`docs/flow8-midi-implementation.md`) a opravuje jeho chybné závěry o autentizaci.
Ověřeno na našem kusu (host handshake `35 01 38 …`).

Surová data: [`ble/automap.json`](ble/automap.json) (MIDI CC → BLE zpráva pro každý parametr)
a [`ble/calib.json`](ble/calib.json) (MIDI hodnota 0–127 → BLE hodnota pro každý typ parametru).
Mapa vznikla automaticky: aplikace posílala dokumentované MIDI CC přes USB a zapisovala,
co pult zároveň ohlásil přes BLE.

## Přenos
- Zařízení `FLOW 8 LE`, služba `14839ad4-8d7e-415c-9a42-167340cf2339`,
  jediná charakteristika `0034594a-a8e7-4b1a-a6b1-cd5243059a57` (write with response + notify).
- Rámec: `[typ] [0x01] [data…] [součet]`, součet = součet všech předchozích bajtů mod 256.
- Pult odpovídá (echo) na každý zápis notifikací se stejným obsahem.
- Naráz je připojen jen jeden BLE klient.

## Párování (oprava komunitní dokumentace)
- `0x39` **není statický klíč**. V nativní knihovně FLOW Mix je to `handshake_client.id`:
  16bajtové ID klienta, které si appka jednou vygeneruje (`client_id.json`).
- `0x35` je `handshake_host` (`id`, `firmware_buildnr`, `pairing_any`, `protocol_version`,
  bajt „is in pairing process“).
- Pult přijme jen **spárované** ID. Neznámé ID → zápis odmítnut GATT chybou 0x0E (Unlikely Error).
- Spárování nového klienta: na pultu **MENU > PAIRING > PAIR APP > potvrdit**, pak poslat
  `39 01 <16 B id> <součet>` → pult odpoví `36 01 37` a ID si pamatuje (ověřeno: další připojení
  už PAIR APP nepotřebuje).

## Relace
1. `39 01 <id> sum` → `36 01 37`
2. `37 01 38` → celý stav `0x38` ve 4 částech (`38 04 01 <část> …`)
3. `07 01 08` → názvy snapshotů `0x27` (délka + text)
4. `21 01 08 40 41 42 43 c4 c5 c6 cf 00 00 00 00 00 00 00 sum` → echo, spustí metering `0x22` (~300 ms)

## Adresy
| ID | Strip |
|---|---|
| `00`–`06` | CH 1, CH 2, CH 3, CH 4, CH 5/6, CH 7/8, USB/BT |
| `0a`, `0b` | MON 1, MON 2 |
| `0c`, `0d` | FX 1, FX 2 (bus i FX slot) |
| `0f` | MAIN |

## Zprávy (stejný formát oběma směry; pult je posílá i při fyzickém pohybu ovladače)
| Typ | Formát | Význam |
|---|---|---|
| `06` | `06 01 <strip> <cíl> <v>` | úroveň: `cíl 0f` = fader do MAIN, `0a/0b` = send MON1/2, `0c/0d` = send FX1/2; u busů `cíl` = vlastní ID busu |
| `00` | `00 01 <strip> <v>` | pan / balance |
| `01` | `01 01 <strip> <0/1>` | solo |
| `08` | `08 01 <strip> <0/1>` | mute (u `0c`/`0d` = FX mute) |
| `02` | `02 01 <strip> <v>` | gain |
| `04` | `04 01 <strip> <f16> <v16>` | low cut (Hz, 16 bit) |
| `13` | `13 01 <strip> <v>` | kompresor |
| `09` | `09 01 <strip> <pásmo> <f16> <q> <v>` | EQ kanálu, pásma 0–3: 100 Hz (`00 64`), 500 Hz (`01 f4`), 2 kHz (`07 d0`), 12 kHz (`2e e0`) |
| `03` | `03 01 <bus> <pásmo> <f16> <q> <v>` | 9pásmový EQ busu (63 Hz … 16 kHz) |
| `14` | `14 01 <bus> <v>` | limiter |
| `11` | `11 01 <fx> <p1> <p2> 00 01` | FX parametry |
| `31` | `31 01 <fx> <preset 0–15>` | FX preset |

## Další příkazy (z knihovny FLOW Mix)
| Typ | Formát | Význam | Ověřeno |
|---|---|---|---|
| `40` | `40 01 <bpm lo> <bpm hi>` | FX tempo v BPM (16 bit LE) | ✅ echo + stav (offset 0x182) |
| `15` | `15 01 <strip> <0/1>` | phantom 48 V | ✅ (příznak `0x08` ve flags kanálu) |
| `20` | `20 01 <index 0–15>` | načtení snapshotu (snapshot 1 = index 0) | ✅ |
| `25` | `25 01 <id> 01 <v>` | nastavení: `09` = CH 5/6 ← USB 1/2, `0a` = CH 7/8 ← USB 3/4 | ✅ (CH 5/6) |
| `21` | `21 01 …` | MeterRequest (metering) | — |

Pult si pamatuje **jen jednoho** spárovaného klienta – spárování nového (PAIR APP) odpáruje předchozí.

## Škály hodnot (MIDI 0–127 → BLE)
| Typ | BLE rozsah | Poznámka |
|---|---|---|
| úroveň (`06`) | 0–255 | nelineární; MIDI 0 = 0, 64 = 0x40, 127 = 0xff (tabulka v calib.json) |
| pan (`00`) | 0–254 | střed ≈ 0x7f |
| EQ (`09`, `03`) | 0–254 | střed 0x7f = 0 dB |
| gain (`02`) | 0x50–0xf0 | |
| low cut (`04`) | 16 bit Hz | 20–600 Hz |
| comp (`13`) | 0–255 | |
| limiter (`14`) | 0x3c–0x78 | |
| FX param 1 (`11`) | 0–100 | |

## MIDI (USB) – ověřené odchylky od manuálu
- Program Change: **bajt N = snapshot/preset N** (0 pult ignoruje).
