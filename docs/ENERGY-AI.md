# EKODI Energy AI

## Product role

`energy.ekodi.kr` is the energy-management surface for the EKODI ecosystem. It combines household electricity, solar generation, ESS, EV charging and time-shiftable smart-home loads under one explainable AI manager.

The first release is intentionally **staging-only and actuation-isolated**. It proves the user experience, safety policy and deployment boundary before any physical device integration.

## Core modules

- **Flow**: current solar production, household demand, ESS state and grid import/export.
- **Solar AI**: production forecast, efficiency comparison, anomaly detection and maintenance hints.
- **Devices**: ESS, EV, smart meter and time-shiftable smart-home loads.
- **AI Manager**: recommendations, permission state, activity timeline and monthly reporting model.

## Authority model

Energy automation follows four levels:

1. **Observe**: read telemetry and detect anomalies.
2. **Suggest**: recommend a safer or cheaper energy plan without acting.
3. **Approve**: execute only a user-approved low-risk schedule through a future explicit adapter.
4. **Bounded auto**: execute only pre-authorized low-risk rules inside hard limits.

The UI may display all four levels, but staging has no physical control adapter and therefore cannot execute equipment actions.

## Permanent safety boundary

The general AI automation layer must not bypass or redefine electrical protection. These are permanently outside normal automation authority:

- breaker trip/off used as a safety function
- protection relay override or protection-setting changes
- inverter safety-setting changes
- emergency-control override
- safety-interlock bypass

Future device adapters must preserve manufacturer, electrical-code and site protection behavior even when a user requests a broader automation mode.

## Staging contract

`wrangler.energy-staging.toml` keeps:

- `TELEMETRY_ENABLED = "false"`
- `TELEMETRY_MODE = "isolated-staging"`
- `CONTROL_ENABLED = "false"`

The dashboard therefore uses clearly labelled sample telemetry. `/health` exposes the isolation state, and `/api/action-check` can evaluate policy without actuating a device.

## Integration roadmap

### Phase A: read-only telemetry

Connect one supported smart meter or inverter vendor through an Energy-specific adapter. Store no long-lived credentials in the browser. Normalize data into a minimal model: timestamp, solar kW, home load kW, grid kW, ESS SOC/flow and device health.

### Phase B: forecasting and anomaly detection

Add weather/irradiance inputs, historical baseline comparison and explainable anomaly signals. Alerts should state evidence and confidence rather than treating every deviation as a fault.

### Phase C: approval-based low-risk automation

Introduce explicit adapters only for time-shiftable actions such as EV charge scheduling, water-heater scheduling or ESS target adjustment when supported by the vendor. Every action must be auditable and reversible where the equipment permits it.

### Phase D: bounded automation

Allow user-defined limits such as reserve SOC, charging windows, maximum import power and comfort constraints. Safety-critical equipment functions remain outside this layer.

## Production promotion gate

Do not mark the service `homepage=true` or `productionVerified=true` until all of the following are true:

1. Energy-specific unit/static tests pass.
2. ecosystem boundary/UI/mission-governance validation passes.
3. isolated staging deploy succeeds.
4. staging `/health` confirms telemetry and control are disabled for the MVP.
5. a permanently blocked action remains blocked at the live staging hostname.
6. production deployment exists as an independent Energy release unit.
7. `https://energy.ekodi.kr` is verified after deployment.

Only then should the root service registry surface Energy AI on `ekodi.kr`.
