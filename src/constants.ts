export const LOCAL_STORAGE = {
  USER_TOKEN: "user_token",
};

export type ROUTE_KEY = "setup" | "interview" | "report";

// Static report placeholders — things the report design shows that the backend doesn't
// produce yet (candidate name, percentile, confidence, onsite verdict, running journey).
// Tagged "sample" in the UI until the backend supplies them.
export const REPORT_PLACEHOLDER = {
  candidateName: "Candidate",
  roleTitle: "Senior Backend Engineer",
  percentileLabel: "Top 15% of Backend Candidates",
  confidencePct: 82,
  // Running score over the call — not tracked yet.
  journey: {
    labels: ["00:03", "00:11", "00:18", "00:24", "00:31", "00:37", "00:43"],
    scores: [70, 75, 79, 76, 68, 56, 59],
  },
};
