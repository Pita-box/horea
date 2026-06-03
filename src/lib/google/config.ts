import 'server-only';

export const GOOGLE_BACKUP_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
] as const;

type GoogleOAuthEnv =
  | 'GOOGLE_OAUTH_CLIENT_ID'
  | 'GOOGLE_OAUTH_CLIENT_SECRET'
  | 'GOOGLE_OAUTH_REFRESH_TOKEN'
  | 'GOOGLE_DRIVE_BACKUP_FOLDER_ID';

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  backupFolderId: string;
  scopes: typeof GOOGLE_BACKUP_SCOPES;
};

function requireEnv(name: GoogleOAuthEnv): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  return {
    clientId: requireEnv('GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: requireEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
    refreshToken: requireEnv('GOOGLE_OAUTH_REFRESH_TOKEN'),
    backupFolderId: requireEnv('GOOGLE_DRIVE_BACKUP_FOLDER_ID'),
    scopes: GOOGLE_BACKUP_SCOPES,
  };
}
