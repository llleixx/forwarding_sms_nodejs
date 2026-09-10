# ML307X compatibility and optional deployment

Based on Lewsol/forwarding_sms_nodejs commit
`b653b153dfb893616a34ac4d852adb41412c2aa2`. Application changes, optional USB
workaround and deployment examples are separate commits. This is experimental
support tested on one ML307X-DC-MBRH1S00; see [validation](deploy/validation.md).

## Reusable application changes

| Configuration | Default when omitted | Opt-in behavior |
| --- | --- | --- |
| lifecycle.resetProtocolStack | upstream startup reset | false skips startup CFUN off/on |
| lifecycle.forceMobileDataOff | upstream forced data disconnect | false skips startup/exit forced disconnect |
| lifecycle.probeSimSlots | upstream active slot probing | false disables startup active slot probing |
| sim.singleSim | upstream SIM handling | true bypasses dual-SIM queries/switching |
| sim.pinFile | no automatic PIN submission | reads PIN from a separate file |
| sim.pinAttemptFile | data/pin-attempt.json | durable automatic-unlock attempt marker |

These switches do not disable explicit user/API actions. For a single-card
deployment use all three lifecycle switches plus singleSim as in the example.
Startup queries CFUN and skips a change when already 1; otherwise the existing
full-functionality helper may enable radio operation. Registration must succeed
before SMS setup. This fork now fails initialization if registration times out.
The registration helper is inherited; it is not a new LTE-only state machine.

ML307X SMS initialization checks the observed CMGF/CNMI capability syntax and
IRA charset before setting CMGF=0, CNMI=2,2,0,2,0, CSCS="IRA" and
CSMP=33,167,0,0 once each. This is a conservative firmware-specific check, not
a generic capability parser; equivalent responses from other firmware can fail.
Unsupported settings fail explicitly. Existing web/API endpoints are retained.

PIN unlock submits only on explicit SIM PIN with a positive AT+CPINR counter.
READY skips both reading and submitting the PIN. PUK/unknown states and unknown
retry counts fail closed. A file and directory fsync persist an exclusive marker
before submission. Failure, timeout or process interruption leaves it in place;
future automatic attempts are refused. Confirmed READY removes it. If a stale
marker remains while already READY, it is deliberately retained. To clear one,
stop the service, verify SIM identity, PIN and remaining attempts, then manually
remove it. Never delete it in startup/restart scripts. The marker is shared for
this single-modem deployment, not keyed to SIM identity. PIN command text/echoes
are redacted; do not place the PIN in config, command-line arguments or git.

## Optional Linux deployment

Use a working AT tty first. If CDC ACM fails on the tested USB layout, review
[the separate USB workaround](deploy/USB-WORKAROUND.md). It is not automatically
installed. No USB mode change or server routing change is part of this profile.

Clone under /opt/docker/sms-forwarding. Keep the upstream docker-compose.yml for
the upstream deployment; explicitly select compose.ml307x.yml for this recipe.

```sh
umask 077
mkdir -p secrets data logs
cp deploy/config.ml307x.example.json config.json
chmod 600 config.json
```

Set api.webToken to a freshly generated random token. Provision secrets/sim-pin
privately with mode 0600, or remove sim.pinFile and its Compose bind mount if
automatic unlock is not needed. The secret file must exist before starting;
never put actual credentials in the example. No sample phone numbers, push
channels or SMTP are configured. Inbox retention is 200, displayed as one card.

```sh
docker compose -f compose.ml307x.yml config --quiet
docker compose -f compose.ml307x.yml build
docker compose -f compose.ml307x.yml up -d
```

The image uses the upstream Dockerfile/lockfile. Runtime config, inbox and logs
are mounted separately and excluded from git/build context. Port 3000 binds to
127.0.0.1 only; restart is unless-stopped and Docker logs rotate. No privileged
mode is used. The upstream /dev and /sys mounts are broad: the cgroup permits
all major-188 serial devices, while application configuration opens only the
stable AT name. This is not strict device isolation. Adapt the cgroup rule if
using another tty driver. Set standard build proxy args if needed; a host-local
proxy needs a reachable address from the build network. No proxy is hardcoded.

Adapt deploy/sms.conf.example to your domain and certificate paths, install it
as /etc/nginx/conf.d/sms.conf, run nginx -t, then reload only on success. The
example uses IPv4/IPv6 TLS on 8888, modern `http2 on`, proxy headers and a 497
HTTPS redirect. Older Nginx versions may need different HTTP/2 syntax. Configure
your own DNS/ingress mapping. Verify certificate/hostname with curl --resolve
before DNS propagation. Domain names and certificate locations are placeholders.

## Security and reliability limits

The inherited login form submits the token using GET. Using the form does NOT
keep the token out of URLs, browser history or intermediary logs. The example
disables Nginx access logging for this vhost, but that does not fix the login
design or protect other proxies. POST login and secure session handling remain
future work; no claim of a completed security hardening is made. Upstream logs
can contain SMS text. Limit host access to config, data and logs.

SMS uses direct URC delivery, JSON inbox files and in-memory multipart assembly.
There is no durable receive spool or delivery job queue, and no guarantee of
receiving messages sent during downtime. Data-network controls are inherited
and not validated for this firmware. A working status page is not evidence of
long-term SMS delivery reliability.

## Tests and operations

With Node.js 22 and dependencies installed via npm ci, run `npm test`.
Or use the built image without modem/device/secret mounts:

```sh
docker run --rm --entrypoint node -v "$PWD/compat.test.mjs:/app/compat.test.mjs:ro" sms-forwarding:ml307x-local --test compat.test.mjs
docker compose -f compose.ml307x.yml logs --tail=100 sms-forwarding
docker compose -f compose.ml307x.yml restart sms-forwarding
```

Tests mock AT responses and reconstruct storage in a temporary directory. They
do not substitute for real PIN recovery, SMS reception or hotplug testing.
See the validation record for completed checks and outstanding acceptance.

## Rollback

Stop with docker compose -f compose.ml307x.yml down without deleting data.
Remove only this project's Nginx configuration, validate nginx -t, then reload.
Revert optional USB rules following their own rollback instructions. Preserve
config, data, logs and your pre-deployment AT/route/driver baseline. Restore SMS
parameters from YOUR module's baseline before releasing the AT port; another
installation's values may be wrong. Do not automatically reset radio, relock a
live SIM or unload a driver used by other devices.
