ALTER TABLE "Group"
ADD COLUMN "pendingParticipantPhoneSuffixes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Group"
SET "pendingParticipantPhoneSuffixes" = COALESCE(
  ARRAY(
    SELECT DISTINCT RIGHT(
      REGEXP_REPLACE(COALESCE(participant ->> 'phone', ''), '\D', '', 'g'),
      10
    )
    FROM JSONB_ARRAY_ELEMENTS(
      CASE
        WHEN JSONB_TYPEOF("preAddedParticipants") = 'array' THEN "preAddedParticipants"
        ELSE '[]'::jsonb
      END
    ) AS participant
    WHERE JSONB_TYPEOF(participant) = 'object'
      AND RIGHT(
        REGEXP_REPLACE(COALESCE(participant ->> 'phone', ''), '\D', '', 'g'),
        10
      ) <> ''
  ),
  ARRAY[]::TEXT[]
);

CREATE INDEX "Group_pendingParticipantPhoneSuffixes_idx"
ON "Group"
USING GIN ("pendingParticipantPhoneSuffixes");
