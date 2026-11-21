# Church Pages strict nine-locale diagnosis — protected recovery checkpoint

## Evidence
- Church home/source PR `ekodi-church#189` merged as `2e6c4949aa21a7a54eb8333d2a0fdda72090f217` and live `https://ekodi.kr/ekodichurch/` now shows direct QTIN in the public six-item menu without a My Page shortcut.
- Central Pages gate recovery `ekodi-platform#10097` merged as `87227675fca93bd3db402975f2d1ea234613c69a`; its receipt-bound Church Pages deployment run `44917356455` promoted the independent source but failed strictly in native nine-language postrelease verification at Puppeteer `eval1:15`, the residual Hangul wait.
- The first suspected untranslated QTIN supporting text was added to every Church locale in `ekodi-church#191`, merged as `1f98fab7a177c28637b8796d19a96e79790c9fd2`; a guarded rerun of the same official Pages workflow again failed in the *same* strict residual Hangul step. Other unresolved Korean text or asset caching remains possible; no false conclusion.
- This source PR `ekodi-platform#10107` and official recovery PR `#10108` add **diagnostic evidence only**: on the existing 20-second fail-closed translation timeout, log a bounded set of actual Korean text fragments, actual locale, text length and QTIN label, then rethrow the original error.
- Protected source SHA for this recovery: `df21aa3c48d8bc25bc7010f242de8fad2a6b41fc`. Orchestrator recovery task: `orch_recovery_df21aa3c48d8bc25bc7010f242de8fad`.

## Safety and completion
This appended source-receipt checkpoint preserves the strict 9-locale test, website functional code, legacy/C3 provenance, OAuth, consent, live broadcast, privacy, and payment controls. It requests authentic CI after GitHub Actions bot generated placeholder `action_required` checks. These placeholders are not success.

Run protected genuine CI, orchestrated convergence, and receipt-bound Church Pages deployment. Read its diagnostic for the precise residual Korean; fix *only* independently owned translations or genuine routing/caching defects, then revalidate all nine languages, mobile and real URLs. Keep the user Opera closed to automated tabs; do not publish synthetic live video or perform orders. Cloudflare Pages HTTP success alone cannot be reported as nine-language release completion. Tracking issue: `ekodi-platform#10054`.
