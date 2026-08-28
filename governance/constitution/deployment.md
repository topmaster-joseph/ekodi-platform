# Deployment Constitution
1. Production writes use guarded release controllers and candidate/staging validation.
2. Topology/shared-edge changes are manual, serialized and regression-tested.
3. Releases require health/smoke/boundary validation and rollback capability.
