# EKODI Education teacher super-admin return path — current-head guarded CI checkpoint

- Independent user task: edu-admin-return-20261117
- Source PR: #9858; official orchestrator PR: #9859.
- Exact permitted administrator return address: https://ekodi.kr/edu/teach/
- No external origin, arbitrary subroute, query parameter, or hash is accepted; all other routes follow the existing administrator default.
- This is a **return-path allowlist correction**, not authorization to edit Education materials. The actual verified super_admin identity still must be issued by Central EKODI Control API and the Education Worker.
- First source tests on 8bc05bd6955fecc38434235196619742e0712b44 detected one incorrect regression expectation (`centralLogin('admin')` was not called directly because the existing handler calls `signIn('admin',adminToken())`). The unit test was corrected to reflect the actual two-step call path.
- Genuine source commit 540b9d93cc2b02e183a8113498f603d5df16ac5a had all source checks green, including full CI, Supabase Local CI, Auth Hub CI, Auth FedCM Contract and EKODI AI Orchestration Gate.
- The automated synchronization of the official branch from newly advanced main produced head 68f98b002cefd50ac8a9afd829a5dfdeecaf94db whose bot-authored check runs report `action_required`. These are **not valid completed tests** on that head.
- This owner-authored documentation-only checkpoint requests genuine exact-HEAD CI on official PR #9859, protected review/merge and separate guarded Shared Site Core release. No credentials, route infrastructure, production permissions or authentication authority are modified by this checkpoint.

Acceptance: real `https://ekodi.kr/auth/?site=admin&direct=1&return_to=https%3A%2F%2Fekodi.kr%2Fedu%2Fteach%2F` must preserve return path for authenticated super admin, while `/edu/teach/` still rejects anonymous access.
