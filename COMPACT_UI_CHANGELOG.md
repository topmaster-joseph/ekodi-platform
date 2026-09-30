# Compact Control Center rollout

- Compact desktop layout with reduced whitespace and smaller cards.
- English-only left navigation labels.
- Separate `Policies` page inside the Control Center.
- Overview no longer duplicates the full Finance panel.
- Existing Google administrator authentication, Clients and finance modules remain independent.
- Compact UI is injected as a separate CSS/JS layer for easy rollback.
- Production deploy verifies compact assets, Google authentication assets, customer access assets and no-redirect admin routes.
