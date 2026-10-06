-- SeonamMedi citizen opinions are now owned by the standalone board D1.
-- Clear the retired shared-D1 civic tables after live board cutover verification.
DELETE FROM seonammedi_civic_voice_replies;
DELETE FROM seonammedi_civic_voices;
