export interface ConfigIssue {
  /** Where the problem is, e.g. `collections.posts.fields.slug.from`. */
  readonly path: string
  readonly message: string
  /** How to fix it. */
  readonly hint?: string
}

export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[]

  constructor(issues: readonly ConfigIssue[]) {
    super(ConfigError.format(issues))
    this.name = 'ConfigError'
    this.issues = issues
  }

  static format(issues: readonly ConfigIssue[]): string {
    const lines = issues.map((issue) => {
      const hint = issue.hint ? `\n    → ${issue.hint}` : ''
      return `  • ${issue.path}: ${issue.message}${hint}`
    })
    const noun = issues.length === 1 ? 'problem' : 'problems'
    return `Invalid Easy CMS config (${issues.length} ${noun}):\n${lines.join('\n')}`
  }
}
