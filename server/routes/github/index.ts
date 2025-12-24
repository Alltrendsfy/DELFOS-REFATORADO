import { Router } from "express";
import { isAuthenticated } from "../../replitAuth";

export function registerGitHubRoutes(router: Router) {
    // Check GitHub connection status
    router.get('/api/github/status', isAuthenticated, async (req: any, res) => {
        try {
            const { githubService } = await import('../../services/githubService');
            const isConnected = await githubService.isConnected();
            res.json({ connected: isConnected });
        } catch (error) {
            res.json({ connected: false });
        }
    });

    // Get authenticated GitHub user
    router.get('/api/github/me', isAuthenticated, async (req: any, res) => {
        try {
            const { githubService } = await import('../../services/githubService');
            const user = await githubService.getAuthenticatedUser();
            res.json(user);
        } catch (error: any) {
            console.error("[ERROR] Failed to get GitHub user:", error);
            if (error.message === 'GitHub not connected') {
                return res.status(400).json({ message: "GitHub not connected. Please set up the GitHub integration." });
            }
            res.status(500).json({ message: "Failed to get GitHub user" });
        }
    });

    // List user repositories
    router.get('/api/github/repos', isAuthenticated, async (req: any, res) => {
        try {
            const { githubService } = await import('../../services/githubService');
            const { per_page, page } = req.query;
            const repos = await githubService.listRepositories({
                per_page: per_page ? parseInt(per_page as string, 10) : undefined,
                page: page ? parseInt(page as string, 10) : undefined
            });
            res.json(repos);
        } catch (error: any) {
            console.error("[ERROR] Failed to list GitHub repos:", error);
            if (error.message === 'GitHub not connected') {
                return res.status(400).json({ message: "GitHub not connected. Please set up the GitHub integration." });
            }
            res.status(500).json({ message: "Failed to list repositories" });
        }
    });

    // Get specific repository details
    router.get('/api/github/repos/:owner/:repo', isAuthenticated, async (req: any, res) => {
        try {
            const { githubService } = await import('../../services/githubService');
            const { owner, repo } = req.params;
            const repository = await githubService.getRepository(owner, repo);
            res.json(repository);
        } catch (error: any) {
            console.error("[ERROR] Failed to get GitHub repo:", error);
            if (error.message === 'GitHub not connected') {
                return res.status(400).json({ message: "GitHub not connected. Please set up the GitHub integration." });
            }
            res.status(500).json({ message: "Failed to get repository" });
        }
    });

    // Create new repository
    router.post('/api/github/repos', isAuthenticated, async (req: any, res) => {
        try {
            const { githubService } = await import('../../services/githubService');
            const { name, description, isPrivate } = req.body;

            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                return res.status(400).json({ message: "Repository name is required" });
            }

            const repository = await githubService.createRepository(name.trim(), {
                description: description || undefined,
                private: isPrivate !== false
            });

            res.status(201).json(repository);
        } catch (error: any) {
            console.error("[ERROR] Failed to create GitHub repo:", error);
            if (error.message === 'GitHub not connected') {
                return res.status(400).json({ message: "GitHub not connected. Please set up the GitHub integration." });
            }
            res.status(500).json({ message: "Failed to create repository" });
        }
    });

    // Backup project to GitHub repository
    router.post('/api/github/backup', isAuthenticated, async (req: any, res) => {
        try {
            const { githubService } = await import('../../services/githubService');
            const fs = await import('fs');
            const path = await import('path');
            const glob = (await import('glob')).glob;

            const { owner, repo, message } = req.body;

            if (!owner || !repo) {
                return res.status(400).json({ message: "Owner and repository name are required" });
            }

            const commitMessage = message || `DELFOS Backup - ${new Date().toISOString()}`;

            const patterns = [
                'client/src/**/*.ts',
                'client/src/**/*.tsx',
                'client/src/**/*.css',
                'server/**/*.ts',
                'shared/**/*.ts',
                'package.json',
                'tsconfig.json',
                'vite.config.ts',
                'tailwind.config.ts',
                'drizzle.config.ts',
                'replit.md',
                'design_guidelines.md',
                '.gitignore'
            ];

            const files: Array<{ path: string; content: string }> = [];
            const baseDir = process.cwd();

            for (const pattern of patterns) {
                try {
                    const matches = await glob(pattern, {
                        cwd: baseDir,
                        nodir: true,
                        ignore: ['node_modules/**', '.git/**', 'dist/**']
                    });

                    for (const match of matches) {
                        try {
                            const fullPath = path.join(baseDir, match);
                            const content = fs.readFileSync(fullPath, 'utf-8');
                            files.push({ path: match, content });
                        } catch (readErr) {
                            console.warn(`[WARN] Could not read file ${match}:`, readErr);
                        }
                    }
                } catch (globErr) {
                    console.warn(`[WARN] Pattern ${pattern} failed:`, globErr);
                }
            }

            if (files.length === 0) {
                return res.status(400).json({ message: "No files found to backup" });
            }

            console.log(`[INFO] Starting backup of ${files.length} files to ${owner}/${repo}`);

            const result = await githubService.backupToRepository(owner, repo, files, commitMessage);

            console.log(`[INFO] Backup complete: ${result.filesUploaded} files uploaded`);

            res.json({
                success: result.success,
                filesUploaded: result.filesUploaded,
                totalFiles: files.length,
                errors: result.errors,
                message: result.success
                    ? `Successfully backed up ${result.filesUploaded} files to ${owner}/${repo}`
                    : `Backup completed with errors: ${result.filesUploaded}/${files.length} files uploaded`
            });
        } catch (error: any) {
            console.error("[ERROR] Failed to backup to GitHub:", error);
            if (error.message === 'GitHub not connected') {
                return res.status(400).json({ message: "GitHub not connected. Please set up the GitHub integration." });
            }
            res.status(500).json({ message: `Backup failed: ${error.message}` });
        }
    });
}
