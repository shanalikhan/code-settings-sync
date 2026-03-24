import re

path = 'src/sync.ts'
with open(path, 'r') as f:
    content = f.read()

# Add a new private method to handle showing the diff
new_diff_method = """
    private async showDiff(file: File, remoteContent: string) {
        const local = vscode.Uri.file(file.filePath);
        const remote = vscode.Uri.file(file.filePath + ".remote");
        await G.fs.writeFile(remote.fsPath, remoteContent);
        
        await vscode.commands.executeCommand(
            "vscode.diff",
            remote,
            local,
            `Gist ↔ Local`
        );
    }
"""

# Inject the method into the class
content = content.replace('public async Upload()', f'{new_diff_method}\\n\\n    public async Upload()')

# Modify the Upload method to call this new diff logic
# I will find the part where it prepares the files and insert my logic
upload_logic_search = r"const files = await this.GetFiles();"
upload_logic_replace = r"""
        const files = await this.GetFiles();

        const remoteContent = await this.GetGist();
        if (remoteContent) {
            for (const file of files) {
                if (remoteContent.data.files[file.gistName]) {
                    const remoteFileContent = remoteContent.data.files[file.gistName].content;
                    if (file.content !== remoteFileContent) {
                        await this.showDiff(file, remoteFileContent);
                    }
                }
            }
        }

"""

content = content.replace(upload_logic_search, upload_logic_search + upload_logic_replace)


with open(path, 'w') as f:
    f.write(content)

print("Injected diff logic into src/sync.ts")
