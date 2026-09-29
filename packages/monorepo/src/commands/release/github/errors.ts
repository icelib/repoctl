import { ReleaseCommandError } from '../errors'

export class GitHubApiError extends ReleaseCommandError {
  constructor(message: string, public readonly status: number, public readonly responseBody?: string) {
    super(message)
    this.name = 'GitHubApiError'
  }
}
