/** Override dotenv/Next's project-file loading after a private Care rollout.
 * Ordinary suites must never query application tracking or inherit its writers. */
export const isolatedCareEnvironment = {
  CARE_RECORDS_ENABLED: "false",
  CARE_WATCH_SCHEDULE_ENABLED: "false",
  CARE_READER_DATABASE_URL: "",
  CARE_REPORTER_DATABASE_URL: "",
  CARE_WATCH_DATABASE_URL: "",
  CARE_HOST_WRITES_ENABLED: "false",
};
