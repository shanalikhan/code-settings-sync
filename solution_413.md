```typescript
// Assuming the necessary imports and setup are already in place
import { GitService, GitProvider, Repository, Branch } from 'some-git-library';

export async function setupGitSync(userPreferences: { useGist: boolean, gitProvider: GitProvider, repoUrl: string, branch: Branch[] }) {
    if (userPreferences.useGist) {
        // Logic to setup gist sync
    } else {
        const gitRepo = await GitService.setupRepo(userPreferences.gitProvider, userPreferences.repoUrl);
        for (const branch of userPreferences.branch) {
            gitRepo.addBranch(branch);
        }
    }
}

export async function downloadGitContent(repo: Repository) {
    await repo.pull();
}

export async function uploadGitContent(repo: Repository) {
    await repo.push();
}
```