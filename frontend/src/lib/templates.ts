export interface EngagementTemplate {
  id: string
  label: string
  title: string
  description: string
  verificationCriteria: string
  deliveryMethod: string
}

export const ENGAGEMENT_TEMPLATES: EngagementTemplate[] = [
  {
    id: 'bug-fix',
    label: 'Bug fix',
    title: 'Fix a specific bug',
    description:
      'Fix the bug described in [link to issue/report]. The fix must not introduce regressions in existing behavior.',
    verificationCriteria:
      'The linked issue steps to reproduce no longer reproduce the bug on the deployed/pushed fix. Existing tests still pass. No new console errors or warnings introduced by the change.',
    deliveryMethod: 'GitHub repository',
  },
  {
    id: 'content',
    label: 'Written content',
    title: 'Write [N]-word article on [topic]',
    description:
      'Deliver a [N]-word article on [topic], written for [target audience], in [tone/style]. Must be original, not AI-boilerplate, and factually accurate.',
    verificationCriteria:
      'Word count is within 10% of the target. Covers [required subtopics]. Free of factual errors. Passes a plagiarism/originality check.',
    deliveryMethod: 'Text response',
  },
  {
    id: 'api-integration',
    label: 'API integration',
    title: 'Integrate [service] API into [project]',
    description:
      'Add a working integration with [service]\'s API to [project]: [specific endpoints/flows to cover]. Must handle auth, errors, and rate limits sensibly.',
    verificationCriteria:
      'A live deployment demonstrates [specific user-visible flow] working end to end against the real API. Error states are handled, not silently swallowed. Credentials are not hardcoded in the repo.',
    deliveryMethod: 'GitHub repository',
  },
  {
    id: 'design-asset',
    label: 'Design asset',
    title: 'Design [asset type] for [purpose]',
    description:
      'Design [asset type, e.g. logo/landing page/icon set] for [purpose], matching [brand guidelines/reference style]. Deliver source files plus exported [format].',
    verificationCriteria:
      'The delivered file opens and matches the described style/dimensions/format. Source file is editable (not a flattened export only).',
    deliveryMethod: 'File',
  },
  {
    id: 'data-extraction',
    label: 'Data extraction',
    title: 'Extract structured data from [source]',
    description:
      'Extract [specific fields] from [source, e.g. a set of web pages/PDFs] into a structured [CSV/JSON] file covering [N] records.',
    verificationCriteria:
      'The delivered file has the correct row/record count and required fields, sampled entries match the source, and the file parses as valid [CSV/JSON].',
    deliveryMethod: 'File',
  },
]
