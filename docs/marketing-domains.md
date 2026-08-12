# Marketing AI / CGMA domain registry

EKODI Platform manages these production service domains.

- `marketing.ekodi.kr` → Cloudflare Pages project `marketing-ai`
- `jadam.ekodi.kr` → Cloudflare Pages project `marketing-ai-jadam`
- `pizzamaru.ekodi.kr` → Cloudflare Pages project `marketing-ai-pizzamaru`
- `yogurtpurple.ekodi.kr` → Cloudflare Pages project `marketing-ai-yogurtpurple`
- `cgma.ekodi.kr` → Cloudflare Pages project `cheonggye-market`

Public canonical routes:

- `https://marketing.ekodi.kr/`
- `https://jadam.ekodi.kr/`
- `https://pizzamaru.ekodi.kr/`
- `https://yogurtpurple.ekodi.kr/`
- `https://cgma.ekodi.kr/ai`
- `https://cgma.ekodi.kr/member`
- `https://cgma.ekodi.kr/store`

Compatibility routes retained under the shared Marketing AI domain:

- `https://marketing.ekodi.kr/jadam/`
- `https://marketing.ekodi.kr/pizzamaru/`
- `https://marketing.ekodi.kr/yogurtpurple/`

Marketing AI uses the public product name `마케팅AI` and the common footer `Powered by EKODIBIZ`.
Each merchant custom domain is deployed as its own Cloudflare Pages project so the domain root opens the merchant-specific Marketing AI experience directly.
Merchant links may remain unlisted from the shared Marketing AI index until QA/public-link approval, while the explicitly provisioned custom domains remain valid production endpoints.

`marketing.ekodi.kr` and `cgma.ekodi.kr` are included in the EKODI Control Center service monitor registry. Merchant subdomains are managed as Marketing AI child endpoints rather than separate top-level EKODI services.
