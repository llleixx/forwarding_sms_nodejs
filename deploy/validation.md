# Validation — 2026-09-10

- Upstream commit: b653b153dfb893616a34ac4d852adb41412c2aa2.
- Interface 03 mapped to /dev/ml307x-at; 10 consecutive AT queries passed.
- Native Node serialport successfully opened the generic USB serial device.
- Eight isolated automated tests passed (PIN latch, redaction, initialization, multipart persistence).
- Real modem READY, CEREG 0,5; operator 46000, CSQ 23–24.
- PDU/CNMI/IRA/CSMP initialization succeeded without radio reset or data disconnect.
- Backend unauthorized API 401; authenticated status/SIM/info/inbox APIs 200.
- Nginx syntax passed; authenticated HTTPS /admin and /api/status 200 with valid wildcard certificate.
- Default routes unchanged; original containers remain running, no Docker daemon restart.
- Config and PIN modes 0600; external push channels and SMTP disabled.
- Real container restart passed: service returned to READY; both before/after inbox counts were zero.
- Pending owner participation: real Chinese/long SMS, restart persistence of actual records, USB replug and cold PIN recovery.
- No outgoing SMS or forwarding request was sent.
