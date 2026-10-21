# EKODI Home Energy AI

Safety-first household energy management MVP.

## Current scope

`observe → detect → recommend → human decision`

This module intentionally stops before device execution. It can analyze real telemetry, detect configured anomalies, recommend energy-saving actions and classify requested actions against a fail-closed policy. It does not replace electrical inspection or electrical protection devices.

## Safety boundary

Autonomous in MVP:
- telemetry read
- anomaly analysis
- recommendation creation

Human gate:
- device power on/off
- thermostat changes
- schedule changes

Forbidden:
- main breaker switching
- disabling RCD/electrical safety protection
- disabling safety alarms
- powering off medical devices
- executing unknown device actions

Protected categories include medical, refrigeration, fire safety, security, network core and electrical safety devices.

## Data path

```text
Meter / smart plug / appliance sensor
        ↓
Home Assistant or local gateway
        ↓
Sanitized telemetry snapshot
        ↓
EKODI Home Energy policy engine
        ↓
Anomaly + recommendation
        ↓
Human approval gate
        ↓
Future local executor + verification + audit
```

The preferred future control design keeps mains-affecting execution local. Cloud services may analyze sanitized telemetry and produce bounded intents, but a local executor must enforce the same policy before any permitted device action.

## Snapshot contract

```json
{
  "totalPowerW": 0,
  "baselinePowerW": 0,
  "pricePerKwh": 0,
  "devices": [
    {
      "id": "device-id",
      "name": "device name",
      "category": "appliance-category",
      "state": "on",
      "idle": false,
      "controllable": false,
      "critical": false,
      "powerW": 0,
      "expectedMaxW": 0,
      "idleHoursPerDay": 0
    }
  ]
}
```

Values must come from actual sensors or explicit user input. The UI does not ship fabricated household metrics.

## Rollout

1. **MVP / advisory**: manual or local telemetry input, anomaly detection, recommendations, no execution.
2. **Home Assistant bridge**: read actual sensors and maintain device registry/category/criticality.
3. **Approval actions**: approved low-risk plugs and HVAC changes only, with post-action verification and audit.
4. **Learning**: household-specific baselines by hour/day/season and cost-aware scheduling.
5. **Expansion**: reusable tenant model for church, shop and office energy management while keeping private household telemetry isolated.

## Hardware prerequisites for live operation

The software can be staged without hardware. Live household operation requires a supported source of actual telemetry, such as an AMI-accessible meter feed, energy-monitoring smart plugs, appliance integrations, or an electrician-installed energy meter. Any work inside a distribution board must be performed with appropriate electrical expertise and equipment.

## Development

Open `home-energy/index.html` through the repository development server. The dashboard accepts real readings and runs `policy-engine.mjs` locally.

Tests live in `test/home-energy-policy.test.mjs` and run with the repository's standard `npm test` command.
