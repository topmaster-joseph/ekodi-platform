-- EKODI review annotation for the public collaborative media submission RPC.
-- Ordered after 20261005041500_activity_collaborative_media_links.sql so the function exists.

comment on function public.activity_public_submit_media_link(text,text,text,text,text,text,text,text) is
  'Intentional public post-activity media-link submission RPC. Accepts only bounded HTTPS links for ended public activities, de-duplicates canonical URLs, and exposes no participant/contact data.';
