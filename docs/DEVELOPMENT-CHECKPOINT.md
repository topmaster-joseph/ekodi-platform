# Development Checkpoint

A development checkpoint is valid only when the following are all successful for the same branch state:

- source validation
- development build
- Cloudflare development deployment
- development endpoint verification
- Cloudflare boundary audit

A later commit invalidates the previous checkpoint and requires the checks again.
