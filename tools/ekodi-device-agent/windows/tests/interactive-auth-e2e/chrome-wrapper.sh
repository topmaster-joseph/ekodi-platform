#!/bin/bash
exec env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy -u ALL_PROXY -u all_proxy "${EKODI_E2E_CHROMIUM:-/tmp/chromium}" --headless=new --no-sandbox --no-zygote --single-process --ignore-certificate-errors --proxy-server=direct:// --proxy-bypass-list=* --host-resolver-rules="MAP mokpo.factchat.bot 127.0.0.1" "$@"
