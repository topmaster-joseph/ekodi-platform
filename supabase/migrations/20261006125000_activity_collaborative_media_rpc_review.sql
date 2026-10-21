-- EKODI review annotations for public collaborative-media RPCs.
-- Ordered after the 2026-10-05 collaborative media/upload migrations so every function exists.
-- Anonymous access is intentional only for ended, public activities and token-bound upload state.

comment on function public.activity_public_submit_media_link(text,text,text,text,text,text,text,text) is
  'Intentional public post-activity media-link submission RPC. Accepts only bounded HTTPS links for ended public activities, de-duplicates canonical URLs, and exposes no participant/contact data.';

comment on function public.activity_public_reserve_media_upload(text,text,text,text,text,text,bigint,text,text) is
  'Intentional public post-activity photo upload reservation RPC. Requires an ended public activity, SHA-256, allowlisted image MIME type and an 8 MiB size bound; returns a high-entropy upload token and exposes no participant/contact data.';

comment on function public.activity_public_finalize_media_upload(text,text,uuid,text,text) is
  'Intentional token-bound public upload finalization RPC. Publishes only a previously reserved upload when media id, activity and high-entropy upload token all match.';

comment on function public.activity_public_fail_media_upload(text,text,uuid,text) is
  'Intentional token-bound public upload failure RPC. It can only mark the matching in-flight media reservation failed and private when the upload token matches.';

comment on function public.activity_public_media_file_ref(uuid) is
  'Intentional public read projection for ready visible media belonging to an ended public activity. Returns only storage reference and public media metadata; no participant/contact data.';
