# Development Workflow Ownership

Development workflows own validation and deployment only inside the EKODI Development Cloudflare account.

Production workflows own production domains, production credentials, and production deployment.

Cross-boundary automation is intentionally limited to pull-request review and source synchronization. Development automation must not directly mutate production infrastructure.
