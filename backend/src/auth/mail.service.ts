import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import Redis from 'ioredis';
import { secret } from '../secrets';
import { PrismaService } from '../prisma.service';
import { emailStrings, fill } from '../i18n/email-messages';

// Prefix of the reverse pointer written by TwoFactorService.createEmailChangeToken
// (`emailchange:user:<userId>` -> { tokenHash, newEmail }). Its key name carries
// the userId, so an expiry notification is enough to notify the old address.
const USER_KEY_PREFIX = 'emailchange:user:';
// Redis instance 0 is the only DB this app uses, so the expired event channel is
// fixed. `Ex` in `notify-keyspace-events` (set in redis-init.sh) enables it.
const EXPIRED_CHANNEL = '__keyevent@0__:expired';

// Sends transactional email (verification links, 2FA codes) via SMTP from
// SMTP_CREDENTIALS. Without credentials, mail is logged to the console so
// every flow stays testable in dev.
//
// It also owns the lapsed-email-change notice: it subscribes to Redis key
// expiry events, so when a staged change lapses the old address is emailed once
// (this replaced the old @Interval sweep). Redeeming or rotating a link DELETEs
// its keys, and DEL never emits `expired`, so a completed change can't produce
// a false notice.
@Injectable()
export class MailService implements OnModuleInit, OnModuleDestroy {
  // Nest logger for connection warnings and dev-mode mail output.
  private readonly logger = new Logger(MailService.name);
  // SMTP transport from SMTP_CREDENTIALS; null in dev → mail is only logged.
  private transporter: nodemailer.Transporter | null = null;
  // "From" address, taken from the SMTP credentials.
  private from = '';
  // Subscriber-mode connection for expiry events: a client in subscribe mode
  // cannot run ordinary commands, so this one is dedicated to the subscription
  // (same idiom as session.service.ts / twofactor.service.ts).
  private readonly redis: Redis;

  constructor(private readonly prisma: PrismaService) {
    const raw = secret('SMTP_CREDENTIALS');
    const parsed = raw?.match(/^\[([^\]]+)\]:(\d+)\s+([^:<\s]+@[^:\s]+):(.+)$/);
    if (parsed) {
      const [, host, port, user, pass] = parsed;
      this.from = user;
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        secure: false, // 587 = STARTTLS
        auth: { user, pass },
      });
    } else {
      this.logger.warn(
        'SMTP credentials missing or placeholder : emails will be LOGGED to this console instead of sent.',
      );
    }

    // Host/port stay plain env : they're topology, not secrets.
    const host = process.env.REDIS_HOST ?? 'redis';
    const port = parseInt(process.env.REDIS_PORT ?? '6479', 10);
    const password = secret('REDIS_PASSWORD');
    this.redis = new Redis({ host, port, password, retryStrategy: (t) => Math.min(t * 50, 2000) });
    this.redis.on('error', (error) => {
      console.error('Redis error:', error.message);
    });
    // The reverse pointer lapsing is the signal that a pending change went
    // unconfirmed: look the owner up and send the "expired" heads-up.
    this.redis.on('message', (channel, key) => {
      if (channel === EXPIRED_CHANNEL) void this.onExpired(key);
    });
  }

  // Logs (dev) or sends via SMTP. The dev log deliberately omits the body so a
  // verification/reset token never lands in the console.
  private async send(
    to: string,
    subject: string,
    text: string,
    username?: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`📧 [DEV MAIL] user=${username ?? '-'} to=${to} subject="${subject}"`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text });
    } catch (err) {
      this.logger.error(`sendMail to ${to} failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Could not send email : try again later');
    }
  }

  sendVerification(to: string, link: string, lang = 'en', username?: string): Promise<void> {
    const s = emailStrings(lang).verification;
    return this.send(to, s.subject, fill(s.text, { link }), username);
  }

  sendPasswordReset(to: string, link: string, lang = 'en', username?: string): Promise<void> {
    const s = emailStrings(lang).passwordReset;
    return this.send(to, s.subject, fill(s.text, { link }), username);
  }

  send2faCode(to: string, code: string, lang = 'en', username?: string): Promise<void> {
    const s = emailStrings(lang).twoFactor;
    return this.send(to, fill(s.subject, { code }), fill(s.text, { code }), username);
  }

  // Verify-then-commit email change: sent to the NEW address; applied only when
  // this link is opened (15 min).
  sendEmailChange(to: string, link: string, lang = 'en', username?: string): Promise<void> {
    const s = emailStrings(lang).emailChange;
    return this.send(to, s.subject, fill(s.text, { link }), username);
  }

  // Heads-up to the CURRENT address that a change was requested.
  sendEmailChangeNotice(
    oldTo: string,
    newEmail: string,
    lang = 'en',
    username?: string,
  ): Promise<void> {
    const s = emailStrings(lang).emailChangeNotice;
    return this.send(oldTo, s.subject, fill(s.text, { newEmail }), username);
  }

  // Sent to the CURRENT address when a pending change expires unconfirmed.
  sendEmailChangeExpired(oldTo: string, lang = 'en', username?: string): Promise<void> {
    const s = emailStrings(lang).emailChangeExpired;
    return this.send(oldTo, s.subject, s.text, username);
  }

  // Best-effort: a mail/SMTP failure must never crash the process or the
  // listener loop.
  private async onExpired(key: string): Promise<void> {
    if (!key.startsWith(USER_KEY_PREFIX)) return; // ignore the link key's twin
    const userId = key.slice(USER_KEY_PREFIX.length);
    try {
      const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
      if (!user) return;
      await this.sendEmailChangeExpired(user.email ?? '', user.language, user.username);
    } catch (error) {
      this.logger.error(`Email-change expiry notice failed: ${(error as Error).message}`);
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      // Fail loudly (but never fatally) when the server isn't publishing expiry
      // events: the whole notice hangs off this one setting.
      const reply = (await this.redis.config('GET', 'notify-keyspace-events')) as unknown;
      const flags = Array.isArray(reply) ? String(reply[1] ?? '') : '';
      if (!flags.includes('x')) {
        this.logger.warn(
          `Redis notify-keyspace-events is "${flags}" (missing "x"): expired email-change notices will NOT be sent. Expected at least "Ex".`,
        );
      }
      await this.redis.subscribe(EXPIRED_CHANNEL);
    } catch (error) {
      this.logger.warn(`Could not subscribe to Redis expiry events: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.unsubscribe(EXPIRED_CHANNEL).catch(() => {});
    await this.redis.quit();
  }
}
