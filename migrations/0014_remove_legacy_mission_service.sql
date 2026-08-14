-- The former EKODI Mission organization is now canonical EKODI Community.
-- Remove obsolete Control Center service state and monitoring history so the
-- retired mission service cannot reappear from persistent control data.

DELETE FROM service_checks WHERE service_id = 'mission';
DELETE FROM service_controls WHERE service_id = 'mission';
