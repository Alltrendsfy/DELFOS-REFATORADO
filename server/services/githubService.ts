// GitHub Integration Service
// Connected via Replit GitHub integration (connection:conn_github_01KBDPKJV0EMZ87S8YQ9J1R0D2)

import { Octokit } from '@octokit/rest';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings?.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

// Get authenticated user information
export async function getAuthenticatedUser() {
  const octokit = await getUncachableGitHubClient();
  const { data } = await octokit.users.getAuthenticated();
  return data;
}

// List user repositories
export async function listRepositories(options?: { per_page?: number; page?: number }) {
  const octokit = await getUncachableGitHubClient();
  const { data } = await octokit.repos.listForAuthenticatedUser({
    per_page: options?.per_page || 30,
    page: options?.page || 1,
    sort: 'updated',
    direction: 'desc'
  });
  return data;
}

// Get repository details
export async function getRepository(owner: string, repo: string) {
  const octokit = await getUncachableGitHubClient();
  const { data } = await octokit.repos.get({ owner, repo });
  return data;
}

// Create a new repository
export async function createRepository(name: string, options?: { 
  description?: string; 
  private?: boolean;
  auto_init?: boolean;
}) {
  const octokit = await getUncachableGitHubClient();
  const { data } = await octokit.repos.createForAuthenticatedUser({
    name,
    description: options?.description || 'Created from DELFOS Trading Platform',
    private: options?.private ?? true,
    auto_init: options?.auto_init ?? false
  });
  return data;
}

// Check if GitHub is connected
export async function isGitHubConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

// Get or create a file in a repository
async function getFileSha(octokit: Octokit, owner: string, repo: string, path: string): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    if ('sha' in data) {
      return data.sha;
    }
    return null;
  } catch (error: any) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

// Upload a single file to repository
export async function uploadFile(
  owner: string, 
  repo: string, 
  path: string, 
  content: string,
  message: string
): Promise<{ path: string; sha: string }> {
  const octokit = await getUncachableGitHubClient();
  const existingSha = await getFileSha(octokit, owner, repo, path);
  
  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString('base64'),
    sha: existingSha || undefined
  });
  
  return { path, sha: data.content?.sha || '' };
}

// Backup multiple files to a repository
export async function backupToRepository(
  owner: string,
  repo: string,
  files: Array<{ path: string; content: string }>,
  commitMessage: string
): Promise<{ success: boolean; filesUploaded: number; errors: string[] }> {
  const errors: string[] = [];
  let filesUploaded = 0;
  
  for (const file of files) {
    try {
      await uploadFile(owner, repo, file.path, file.content, commitMessage);
      filesUploaded++;
    } catch (error: any) {
      errors.push(`Failed to upload ${file.path}: ${error.message}`);
    }
  }
  
  return {
    success: errors.length === 0,
    filesUploaded,
    errors
  };
}

// Get list of important project files for backup
export function getBackupFilePatterns(): string[] {
  return [
    'client/src/**/*.{ts,tsx,css}',
    'server/**/*.ts',
    'shared/**/*.ts',
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'tailwind.config.ts',
    'drizzle.config.ts',
    'replit.md',
    'design_guidelines.md'
  ];
}

export const githubService = {
  getClient: getUncachableGitHubClient,
  getAuthenticatedUser,
  listRepositories,
  getRepository,
  createRepository,
  isConnected: isGitHubConnected,
  uploadFile,
  backupToRepository,
  getBackupFilePatterns
};
