# EKODI large encrypted archive Drive upload — official recovery latest-head CI

2026-11-08 KST. Source task `points-large-encrypted-drive-upload-20261108`, original source PR #8896, official recovery PR #8897, parent #7778.

Original source run `42434430416` failed only because mocked Google Drive requests omitted the existing `ensureSubfolderPath` lookup before uploading. Official recovery subsequently updated the unit fixture to return a mocked pre-existing folder, commit `4ebc279826d528f1c1c1be681d8c9311d051fc86`. There were no real external HTTP requests in tests or changes to production backup data.

Google's official Drive upload API docs distinguish <=5MB multipart from larger resumable upload. This patch routes bytes >4MiB through the **existing canonical** `writeCanonicalDriveStream` helper; server-side key authorization and OAuth custody remain unchanged. The official head's bot-created `action_required` records are not real test runs, so this documentation-only continuation requires fresh authenticated CI on the current official recovery branch. No direct worker merge or deploy authority is claimed. Actual Storage Control production deployment and real encrypted archive readback remain distinct gates.
