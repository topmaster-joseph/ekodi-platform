# Domain Constitution
1. System/security boundaries use stable subdomains: root, my, admin, auth, api, status and dev mirrors.
2. Features use paths, not new subdomains.
3. Tenant public spaces use the universal root form `ekodi.kr/{slug}`; workspace kind remains internal metadata bound to `workspace_id`. Private work uses `my.ekodi.kr/w/{workspace}`.
4. Existing feature subdomains are registered legacy aliases until safely redirected.
