from pathlib import Path

workflow = Path('.github/workflows/deploy-ekodi-mall.yml')
text = workflow.read_text(encoding='utf-8')

deploy_marker = '''      - name: Deploy staging Mall API
        run: npx --yes wrangler@${WRANGLER_VERSION} deploy --config api/wrangler.staging.runtime.toml

      - name: Verify staging API, schemas and safety gates
'''
deploy_replacement = '''      - name: Deploy staging Mall API
        run: npx --yes wrangler@${WRANGLER_VERSION} deploy --config api/wrangler.staging.runtime.toml

      - name: Ensure narrow staging Access bypasses
        shell: bash
        run: node scripts/ensure-staging-access.mjs

      - name: Verify staging API, schemas and safety gates
'''
if '      - name: Ensure narrow staging Access bypasses\n' not in text:
    if deploy_marker not in text:
        raise SystemExit('Deploy marker not found; refusing ambiguous workflow edit.')
    text = text.replace(deploy_marker, deploy_replacement, 1)

cleanup_marker = '''      - name: Cleanup staging config
        if: always()
        run: rm -f api/wrangler.staging.runtime.toml
'''
protection_step = '''      - name: Verify staging private paths remain Access-protected
        shell: bash
        run: |
          set -euo pipefail
          for attempt in $(seq 1 12); do
            headers=$(mktemp)
            code=$(curl -sS -D "$headers" -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 20 "${STAGING_URL}/api/operations/__access_probe__" || true)
            location=$(awk 'BEGIN{IGNORECASE=1} /^location:/{sub(/^[^:]+:[[:space:]]*/,""); sub(/\\r$/,""); print; exit}' "$headers")
            rm -f "$headers"
            safe_location=${location%%\\?*}
            echo "Mall staging protected-path probe attempt=$attempt status=$code redirect=${safe_location:-none}"
            if [ "$code" = "302" ] && [[ "$safe_location" == *"cloudflareaccess.com"* ]]; then
              echo "Mall staging non-public paths remain Cloudflare Access-protected."
              exit 0
            fi
            sleep 5
          done
          echo "Non-public Mall staging paths are not protected by Cloudflare Access; refusing promotion." >&2
          exit 1

'''
if '      - name: Verify staging private paths remain Access-protected\n' not in text:
    if cleanup_marker not in text:
        raise SystemExit('Cleanup marker not found; refusing ambiguous workflow edit.')
    text = text.replace(cleanup_marker, protection_step + cleanup_marker, 1)

workflow.write_text(text, encoding='utf-8')

for temporary in (
    '.github/workflows/diagnose-ekodi-access-permission.yml',
    '.github/workflows/diagnose-ekodi-mall-staging.yml',
    '.github/workflows/finalize-ekodi-mall-access.yml',
    '.github/scripts/finalize-ekodi-mall-access.py',
):
    Path(temporary).unlink(missing_ok=True)
