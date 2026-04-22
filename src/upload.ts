// VRAI FIX: Ajouter fonction upload vers repository
export async function uploadToRepository(settings: Settings): Promise<void> {
  try {
    const response = await fetch('https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/contents/${settings.filePath}', {
      method: 'PUT',
      headers: {
        'Authorization': `token ${settings.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: settings.commitMessage,
        content: Buffer.from(settings.content).toString('base64')
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to upload: ${response.statusText}`);
    }
    
    console.log('Successfully uploaded to repository');
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}