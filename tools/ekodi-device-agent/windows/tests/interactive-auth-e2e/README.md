# Interactive auth Agent E2E (EKODI-INTERACTIVE-AUTH-001)

Loads the real functions from `ekodi-device-agent.ps1` and drives a real Chromium over CDP against a
local HTTPS mock of `mokpo.factchat.bot`. Only Windows-only seams are doubled (process listing, the
local consent popup, settings). `human.mjs` plays the person at the PC; the agent code never logs in.

```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 -subj "/CN=mokpo.factchat.bot"
sudo node server.mjs &            # binds 127.0.0.1:443
EKODI_E2E_CHROMIUM=/tmp/chromium pwsh -NoProfile -File harness.ps1
```

Expected last line: `ALL AGENT E2E SCENARIOS PASSED`. This does not replace the real Windows PC + real FactChat proof.
