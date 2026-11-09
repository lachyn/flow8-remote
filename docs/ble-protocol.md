# FLOW 8 – BLE protocol (own findings, 7 Nov 2026)

Builds on the community research in [abelroes/flow-8-midi](https://github.com/abelroes/flow-8-midi)
(its [`docs/flow8-midi-implementation.md`](https://github.com/abelroes/flow-8-midi/blob/main/docs/flow8-midi-implementation.md))
and corrects its wrong conclusions about authentication.
Verified on our unit (host handshake `35 01 38 …`).

Raw data: [`ble/automap.json`](ble/automap.json) (MIDI CC → BLE message for every parameter)
and [`ble/calib.json`](ble/calib.json) (MIDI value 0–127 → BLE value for each parameter type).
The map was generated automatically: the app sent documented MIDI CCs over USB and recorded
what the mixer reported over BLE at the same time.

## Transport
- Device `FLOW 8 LE`, service `14839ad4-8d7e-415c-9a42-167340cf2339`,
  single characteristic `0034594a-a8e7-4b1a-a6b1-cd5243059a57` (write with response + notify).
- Frame: `[type] [0x01] [data…] [sum]`, sum = sum of all preceding bytes mod 256.
- The mixer answers (echoes) every write with a notification carrying the same content.
- Only one BLE client can be connected at a time.

## Pairing (correction of the community docs)
- `0x39` is **not a static key**. In the native FLOW Mix library it is `handshake_client.id`:
  a 16-byte client ID that the app generates once (`client_id.json`).
- `0x35` is `handshake_host` (`id`, `firmware_buildnr`, `pairing_any`, `protocol_version`,
  an "is in pairing process" byte).
- The mixer only accepts a **paired** ID. Unknown ID → write rejected with GATT error 0x0E (Unlikely Error).
- Pairing a new client: on the mixer **MENU > PAIRING > PAIR APP > confirm**, then send
  `39 01 <16 B id> <sum>` → the mixer replies `36 01 37` and remembers the ID (verified: later
  connections no longer need PAIR APP).

## Session
1. `39 01 <id> sum` → `36 01 37`
2. `37 01 38` → full state `0x38` in 4 parts (`38 04 01 <part> …`)
3. `07 01 08` → snapshot names `0x27` (length + text)
4. `21 01 08 40 41 42 43 c4 c5 c6 cf 00 00 00 00 00 00 00 sum` → echo, starts metering `0x22` (~300 ms)

## Addresses
| ID | Strip |
|---|---|
| `00`–`06` | CH 1, CH 2, CH 3, CH 4, CH 5/6, CH 7/8, USB/BT |
| `0a`, `0b` | MON 1, MON 2 |
| `0c`, `0d` | FX 1, FX 2 (bus and FX slot) |
| `0f` | MAIN |

## Messages (same format in both directions; the mixer also sends them when a control is moved physically)
| Type | Format | Meaning |
|---|---|---|
| `06` | `06 01 <strip> <target> <v>` | level: `target 0f` = fader to MAIN, `0a/0b` = send MON1/2, `0c/0d` = send FX1/2; for buses `target` = the bus's own ID |
| `00` | `00 01 <strip> <v>` | pan / balance |
| `01` | `01 01 <strip> <0/1>` | solo |
| `08` | `08 01 <strip> <0/1>` | mute (for `0c`/`0d` = FX mute) |
| `02` | `02 01 <strip> <v>` | gain |
| `04` | `04 01 <strip> <f16> <v16>` | low cut (Hz, 16 bit) |
| `13` | `13 01 <strip> <v>` | compressor |
| `09` | `09 01 <strip> <band> <f16> <q> <v>` | channel EQ, bands 0–3: 100 Hz (`00 64`), 500 Hz (`01 f4`), 2 kHz (`07 d0`), 12 kHz (`2e e0`) |
| `03` | `03 01 <bus> <band> <f16> <q> <v>` | 9-band bus EQ (63 Hz … 16 kHz) |
| `14` | `14 01 <bus> <v>` | limiter |
| `11` | `11 01 <fx> <p1> <p2> 00 01` | FX parameters |
| `31` | `31 01 <fx> <preset 0–15>` | FX preset |

## Other commands (from the FLOW Mix library)
| Type | Format | Meaning | Verified |
|---|---|---|---|
| `40` | `40 01 <bpm lo> <bpm hi>` | FX tempo in BPM (16 bit LE) | ✅ echo + state (offset 0x182) |
| `15` | `15 01 <strip> <0/1>` | 48 V phantom power | ✅ (flag `0x08` in the channel flags) |
| `20` | `20 01 <index 0–15>` | load snapshot (snapshot 1 = index 0) | ✅ |
| `25` | `25 01 <id> 01 <v>` | settings: `09` = CH 5/6 ← USB 1/2, `0a` = CH 7/8 ← USB 3/4 | ✅ (CH 5/6) |
| `21` | `21 01 …` | MeterRequest (metering) | — |

The mixer remembers **only one** paired client – pairing a new one (PAIR APP) unpairs the previous one.

## Value scales (MIDI 0–127 → BLE)
| Type | BLE range | Note |
|---|---|---|
| level (`06`) | 0–255 | non-linear; MIDI 0 = 0, 64 = 0x40, 127 = 0xff (table in calib.json) |
| pan (`00`) | 0–254 | centre ≈ 0x7f |
| EQ (`09`, `03`) | 0–254 | centre 0x7f = 0 dB |
| gain (`02`) | 0x50–0xf0 | |
| low cut (`04`) | 16 bit Hz | 20–600 Hz |
| comp (`13`) | 0–255 | |
| limiter (`14`) | 0x3c–0x78 | |
| FX param 1 (`11`) | 0–100 | |

## MIDI (USB) – verified deviations from the manual
- Program Change: **byte N = snapshot/preset N** (the mixer ignores 0).
