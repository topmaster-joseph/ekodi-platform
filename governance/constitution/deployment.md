# Deployment Constitution
1. Production writes use guarded release controllers and candidate/staging validation.
2. Topology/shared-edge changes are manual, serialized and regression-tested.
3. Releases require health/smoke/boundary validation and rollback capability.
4. Mass deletion, platform-wide structural changes, destructive production data changes and critical restores must pass the Critical Change & Recovery Policy.
5. A verified restore point is required before a critical production mutation, and the newest 10 verified restore points must remain visible to the recovery control plane.
6. Restore operations are themselves critical changes: create a pre-restore point, require super-administrator approval, restore through the guarded path, and verify production afterward.
7. Permanent deletion/purge requires a distinct approval from ordinary change approval.
