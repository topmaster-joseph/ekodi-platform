# EKODI User UI Shell Contract

## 1. Position in the UI system
`User UI DNA → User UI Shell → Header / Content Frame / Footer → Service Content`

The User UI DNA defines what every EKODI user surface keeps in common and what each service is free to vary. The User UI Shell is the implementation boundary for shared page chrome. Admin UI is a separate system and is not governed by this contract.

## 2. Header contract
The shared Shell adopts an existing service header first. It must not add a second global header when a service already has one. The adopted header keeps the service's local navigation and visual identity while the Shell standardizes banner semantics, fixed-header offset behavior, safe-area handling, keyboard focus and responsive behavior.

Every user header must make three things understandable: the EKODI relationship, the current service context, and a path to account or My EKODI. Feature navigation remains owned by the service.

## 3. Footer contract
The global footer is supplied by the shared Shell and is not copied into individual services. It always exposes the public Privacy Policy, Terms of Service, contact path, operator information and copyright notice.

A service may append service-specific operator or policy information. It must not replace the EKODI platform footer. When an independently operated service publishes a separate policy, that policy takes precedence for that service's own processing or transaction scope.

## 4. Responsive and accessibility contract
Desktop and mobile must preserve the same meaning even when layout changes. Safe-area insets, visible keyboard focus, semantic `header`/`footer` landmarks, content offset for fixed headers, and reduced-motion preferences are shared requirements.

## 5. Change control
`config/user-ui-shell.json` is the machine-readable source of truth. `scripts/validate-user-ui-dna.mjs` verifies the link to the parent UI DNA and the required Header/Footer contract. Shared footer markup is emitted by `ekodi-shell-injector.js`, while the existing Shell browser runtime adopts and normalizes service headers.
