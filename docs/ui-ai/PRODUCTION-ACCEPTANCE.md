# Production Acceptance Criteria

The EKODI UI/AI update is production-ready when:

1. My EKODI shows one visible Workspace chooser per screen. ✅
2. Mobile header remains fixed and does not overlap content. ✅
3. EKODI User AI suggestions render before system counters. ✅
4. Suggestion generation works without an external AI provider. ✅
5. Specialist services are reached by handoff, not direct AI orchestration. ✅
6. EKODI Admin AI remains scoped to ADMIN UI and admin permissions. ✅
7. Both AI roles use EKODI Core boundaries for identity, workspace and permissions. ✅
8. Existing My EKODI authentication, service routing and workspace persistence tests pass. CI required before merge.

Implementation is complete on the release branch. Merge and production deployment are allowed only after repository CI/deployment validation passes.
