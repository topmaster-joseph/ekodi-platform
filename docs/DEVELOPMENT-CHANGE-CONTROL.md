# Development Change Control

Changes are tested on `development` first. A successful development deployment is necessary but not sufficient for production release.

Production release requires an explicit pull request into `main`, review of the diff, and successful production-side checks. No development workflow may directly publish to production Cloudflare resources.
