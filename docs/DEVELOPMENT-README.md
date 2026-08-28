# EKODI Development Environment

This branch is isolated from production by branch, GitHub environment, Cloudflare account, Worker namespace, and API token.

Operational flow: `development` change → development deploy → development verification → boundary audit → reviewed pull request to `main` → production deployment by existing production workflows.

See `DEVELOPMENT-PROMOTION.md` and `DEVELOPMENT-OPERATIONS-CHECKLIST.md` for the detailed contract and checklist.
