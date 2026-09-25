import type { AuthUser, ID } from '../access.js'
import { stripFields } from '../access-control.js'
import { LOGIN_ATTEMPTS, SESSIONS, USERS } from '../builtins.js'
import type { RawDocument } from '../database.js'
import { ForbiddenError, TooManyRequestsError, UnauthorizedError } from '../errors.js'
import type { EasyCMS } from '../local-api.js'
import { fakeVerify, verifyPassword } from './password.js'
import { csrfToken, hashToken, newToken, signToken, unsignToken } from './tokens.js'

export interface LoginArgs {
  readonly email: string
  readonly password: string
  /** Client IP, used together with the email for rate limiting. */
  readonly ip?: string | undefined
}

export interface Session {
  readonly user: AuthUser
  /** Signed session token, the value of the session cookie. */
  readonly token: string
  /** Send back in the `X-CSRF-Token` header on cookie-authenticated writes. */
  readonly csrfToken: string
  readonly expiresAt: string
}

const INVALID = 'Invalid email or password'

/** Login, logout and session verification. Available as `cms.auth`. */
export class Auth {
  constructor(private readonly cms: EasyCMS) {}

  private get db() {
    return this.cms.db
  }

  private get config() {
    return this.cms.config
  }

  /** Checks credentials and starts a session. Throws `UnauthorizedError` or `TooManyRequestsError`. */
  async login(args: LoginArgs): Promise<Session> {
    const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : ''
    const password = typeof args.password === 'string' ? args.password : ''
    const key = `${email}|${args.ip ?? ''}`
    await this.checkRateLimit(key)

    const [user] = email
      ? (
          await this.db.find({
            collection: USERS,
            where: { email: { equals: email } },
            sort: [],
            limit: 1,
            page: 1,
          })
        ).docs
      : []
    const hash = typeof user?.passwordHash === 'string' ? user.passwordHash : undefined
    const valid =
      user && hash && password ? await verifyPassword(password, hash) : await fakeVerify(password)

    if (!user || !valid || user.active === false) {
      await this.recordFailure(key)
      throw new UnauthorizedError(INVALID)
    }
    await this.clearFailures(key)
    await this.deleteExpiredSessions(user.id)
    return this.startSession(user)
  }

  /** Creates the first admin. Only works while there are no users. */
  async registerFirstUser(args: {
    email: string
    password: string
    name?: string
  }): Promise<Session> {
    if (await this.hasUsers()) throw new ForbiddenError('An admin already exists')
    const user = await this.cms.create(USERS, {
      email: args.email,
      password: args.password,
      role: 'admin',
      active: true,
      ...(args.name ? { name: args.name } : {}),
    })
    const raw = (await this.db.findById({ collection: USERS, id: user.id })) as RawDocument
    return this.startSession(raw)
  }

  async hasUsers(): Promise<boolean> {
    return (await this.db.count({ collection: USERS })) > 0
  }

  /** Ends the session for a signed token. Unknown tokens are ignored. */
  async logout(signedToken: string): Promise<void> {
    const token = unsignToken(this.config.secret, signedToken)
    if (!token) return
    const session = await this.findSession(token)
    if (session) await this.db.delete({ collection: SESSIONS, id: session.id })
  }

  /** Returns the user for a signed session token, or `null` if it is invalid or expired. */
  async verify(signedToken: string | undefined | null): Promise<AuthUser | null> {
    if (!signedToken) return null
    const token = unsignToken(this.config.secret, signedToken)
    if (!token) return null
    const session = await this.findSession(token)
    if (!session) return null
    if (String(session.expiresAt) <= new Date().toISOString()) {
      await this.db.delete({ collection: SESSIONS, id: session.id })
      return null
    }
    const user = await this.db.findById({ collection: USERS, id: session.user as ID })
    if (!user || user.active === false) return null
    return this.toAuthUser(user)
  }

  /** The CSRF token clients must echo for a signed session token. */
  csrfFor(signedToken: string): string | undefined {
    const token = unsignToken(this.config.secret, signedToken)
    return token ? csrfToken(this.config.secret, token) : undefined
  }

  /** Starts a new session for a user, e.g. after they changed their own password. */
  async createSession(userId: ID): Promise<Session> {
    const user = await this.db.findById({ collection: USERS, id: userId })
    if (!user || user.active === false) throw new UnauthorizedError()
    return this.startSession(user)
  }

  /** Signs a user out everywhere. */
  async revokeSessions(userId: ID): Promise<void> {
    const sessions = await this.db.find({
      collection: SESSIONS,
      where: { user: { equals: userId } },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const session of sessions.docs)
      await this.db.delete({ collection: SESSIONS, id: session.id })
  }

  // -------------------------------------------------------------------------

  private async startSession(user: RawDocument): Promise<Session> {
    const token = newToken()
    const now = new Date()
    const expiresAt = new Date(
      now.getTime() + this.config.auth.tokenExpiration * 1000,
    ).toISOString()
    await this.db.create({
      collection: SESSIONS,
      data: {
        tokenHash: hashToken(token),
        user: user.id,
        expiresAt,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    })
    return {
      user: await this.toAuthUser(user),
      token: signToken(this.config.secret, token),
      csrfToken: csrfToken(this.config.secret, token),
      expiresAt,
    }
  }

  private async findSession(token: string) {
    const result = await this.db.find({
      collection: SESSIONS,
      where: { tokenHash: { equals: hashToken(token) } },
      sort: [],
      limit: 1,
      page: 1,
    })
    return result.docs[0]
  }

  private async toAuthUser(user: RawDocument): Promise<AuthUser> {
    const fields = this.cms.collection(USERS).fields
    return (await stripFields(fields, user)) as unknown as AuthUser
  }

  private async deleteExpiredSessions(userId: ID) {
    const expired = await this.db.find({
      collection: SESSIONS,
      where: { user: { equals: userId }, expiresAt: { lte: new Date().toISOString() } },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const session of expired.docs)
      await this.db.delete({ collection: SESSIONS, id: session.id })
  }

  private windowStart() {
    return new Date(Date.now() - this.config.auth.lockWindow * 1000).toISOString()
  }

  private async checkRateLimit(key: string) {
    const recent = await this.db.count({
      collection: LOGIN_ATTEMPTS,
      where: { key: { equals: key }, createdAt: { gt: this.windowStart() } },
    })
    if (recent >= this.config.auth.maxLoginAttempts) {
      throw new TooManyRequestsError('Too many failed login attempts. Try again later.')
    }
  }

  private async recordFailure(key: string) {
    const now = new Date().toISOString()
    await this.db.create({
      collection: LOGIN_ATTEMPTS,
      data: { key, createdAt: now, updatedAt: now },
    })
    // Old attempts for this key no longer count; remove them.
    const old = await this.db.find({
      collection: LOGIN_ATTEMPTS,
      where: { key: { equals: key }, createdAt: { lte: this.windowStart() } },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const attempt of old.docs)
      await this.db.delete({ collection: LOGIN_ATTEMPTS, id: attempt.id })
  }

  private async clearFailures(key: string) {
    const attempts = await this.db.find({
      collection: LOGIN_ATTEMPTS,
      where: { key: { equals: key } },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const attempt of attempts.docs)
      await this.db.delete({ collection: LOGIN_ATTEMPTS, id: attempt.id })
  }
}
