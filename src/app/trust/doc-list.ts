export const DOCUMENTS = [
  { slug: "data-sheet", title: "Data sheet for data protection officers", summary: "One page: what data, where, for how long, who sees it" },
  { slug: "dpia", title: "Data protection impact assessment (template)", summary: "Pre-filled for Red Pen; the school completes the blanks and signs it off" },
  { slug: "dpa", title: "Data processing agreement (template)", summary: "Between the school or authority (controller) and us (processor)" },
  { slug: "subprocessors", title: "Sub-processor list", summary: "Every company that processes pupil data for us, what for and where" },
  { slug: "accessibility", title: "Accessibility statement", summary: "How accessible the service is, and what we know is not yet right" },
] as const;

export type DocSlug = (typeof DOCUMENTS)[number]["slug"];
