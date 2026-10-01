// Transactional-email copy per language. The backend has no i18n framework, so
// this is the single source of email strings; `language` on User picks the set.
export type EmailLang = 'en' | 'fr' | 'ms';

interface EmailStrings {
  verification: { subject: string; text: string }; // {link}
  passwordReset: { subject: string; text: string }; // {link}
  twoFactor: { subject: string; text: string }; // {code}
  emailChange: { subject: string; text: string }; // {link}
  emailChangeNotice: { subject: string; text: string }; // {newEmail}
  emailChangeExpired: { subject: string; text: string };
}

const EN: EmailStrings = {
  verification: {
    subject: 'Verify your RetroLudo 42 account',
    text: 'Welcome to RetroLudo 42!\n\nConfirm this email address by opening:\n\n{link}\n\nThe link expires in 24 hours. If you did not sign up, ignore this mail.',
  },
  passwordReset: {
    subject: 'Reset your RetroLudo 42 password',
    text: 'We received a request to reset your password.\n\nChoose a new one here:\n\n{link}\n\nThe link expires in 1 hour and can be used once. If you did not request this, ignore this mail : your password stays unchanged.',
  },
  twoFactor: {
    subject: '{code} is your RetroLudo 42 login code',
    text: 'Your login code is: {code}\n\nIt expires in 5 minutes. If you did not try to log in, someone knows your password : change it.',
  },
  emailChange: {
    subject: 'Confirm your new RetroLudo 42 email',
    text: 'Confirm this email address for your RetroLudo 42 account by opening:\n\n{link}\n\nThe link expires in 15 minutes. If you did not request this, ignore this mail : your address stays unchanged.',
  },
  emailChangeNotice: {
    subject: 'Email change requested for your RetroLudo 42 account',
    text: "A request was made to change your account email to {newEmail}.\n\nThe new address is not active until the link sent to it is opened. If this wasn't you, change your password : your address is unchanged.",
  },
  emailChangeExpired: {
    subject: 'Your RetroLudo 42 email change expired',
    text: 'A pending email change was not confirmed in time and has expired. Your account email is unchanged.',
  },
};

const FR: EmailStrings = {
  verification: {
    subject: 'Vérifiez votre compte RetroLudo 42',
    text: 'Bienvenue sur RetroLudo 42 !\n\nConfirmez cette adresse e-mail en ouvrant :\n\n{link}\n\nLe lien expire dans 24 heures. Si vous ne vous êtes pas inscrit, ignorez ce message.',
  },
  passwordReset: {
    subject: 'Réinitialisez votre mot de passe RetroLudo 42',
    text: "Nous avons reçu une demande de réinitialisation de votre mot de passe.\n\nChoisissez-en un nouveau ici :\n\n{link}\n\nLe lien expire dans 1 heure et ne peut être utilisé qu'une fois. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
  },
  twoFactor: {
    subject: '{code} est votre code de connexion RetroLudo 42',
    text: "Votre code de connexion est : {code}\n\nIl expire dans 5 minutes. Si vous n'avez pas tenté de vous connecter, quelqu'un connaît votre mot de passe : changez-le.",
  },
  emailChange: {
    subject: 'Confirmez votre nouvel e-mail RetroLudo 42',
    text: "Confirmez cette adresse e-mail pour votre compte RetroLudo 42 en ouvrant :\n\n{link}\n\nLe lien expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre adresse reste inchangée.",
  },
  emailChangeNotice: {
    subject: "Changement d'e-mail demandé pour votre compte RetroLudo 42",
    text: "Une demande de changement de l'e-mail de votre compte vers {newEmail} a été faite.\n\nLa nouvelle adresse ne sera active qu'une fois le lien qui lui a été envoyé ouvert. Si ce n'était pas vous, changez votre mot de passe : votre adresse reste inchangée.",
  },
  emailChangeExpired: {
    subject: "Votre changement d'e-mail RetroLudo 42 a expiré",
    text: "Un changement d'e-mail en attente n'a pas été confirmé à temps et a expiré. L'e-mail de votre compte reste inchangé.",
  },
};

const MS: EmailStrings = {
  verification: {
    subject: 'Sahkan akaun RetroLudo 42 anda',
    text: 'Selamat datang ke RetroLudo 42!\n\nSahkan alamat e-mel ini dengan membuka:\n\n{link}\n\nPautan tamat tempoh dalam 24 jam. Jika anda tidak mendaftar, abaikan e-mel ini.',
  },
  passwordReset: {
    subject: 'Tetapkan semula kata laluan RetroLudo 42 anda',
    text: 'Kami menerima permintaan untuk menetapkan semula kata laluan anda.\n\nPilih yang baharu di sini:\n\n{link}\n\nPautan tamat tempoh dalam 1 jam dan boleh digunakan sekali sahaja. Jika anda tidak meminta ini, abaikan e-mel ini : kata laluan anda kekal tidak berubah.',
  },
  twoFactor: {
    subject: '{code} ialah kod log masuk RetroLudo 42 anda',
    text: 'Kod log masuk anda ialah: {code}\n\nIa tamat tempoh dalam 5 minit. Jika anda tidak cuba log masuk, seseorang tahu kata laluan anda : tukar ia.',
  },
  emailChange: {
    subject: 'Sahkan e-mel baharu RetroLudo 42 anda',
    text: 'Sahkan alamat e-mel ini untuk akaun RetroLudo 42 anda dengan membuka:\n\n{link}\n\nPautan tamat tempoh dalam 15 minit. Jika anda tidak meminta ini, abaikan e-mel ini : alamat anda kekal tidak berubah.',
  },
  emailChangeNotice: {
    subject: 'Permintaan tukar e-mel untuk akaun RetroLudo 42 anda',
    text: 'Satu permintaan telah dibuat untuk menukar e-mel akaun anda kepada {newEmail}.\n\nAlamat baharu tidak aktif sehingga pautan yang dihantar kepadanya dibuka. Jika ini bukan anda, tukar kata laluan anda : alamat anda kekal tidak berubah.',
  },
  emailChangeExpired: {
    subject: 'Pertukaran e-mel RetroLudo 42 anda telah tamat tempoh',
    text: 'Pertukaran e-mel yang belum selesai tidak disahkan dalam masa yang ditetapkan dan telah tamat tempoh. E-mel akaun anda kekal tidak berubah.',
  },
};

const EMAIL: Record<EmailLang, EmailStrings> = { en: EN, fr: FR, ms: MS };

// Unknown/missing language falls back to English.
export function emailStrings(lang: string | null | undefined): EmailStrings {
  return EMAIL[lang as EmailLang] ?? EN;
}

// Fills {placeholders} in a template; unknown keys become ''.
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => vars[key] ?? '');
}
