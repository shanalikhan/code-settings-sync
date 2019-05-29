// @ts-nocheck
const vscode = acquireVsCodeApi();

function sendCommand(args) {
  vscode.postMessage({
    command: args
  });
}

function appendHTML(parent, html) {
  var div = document.createElement("div");
  div.innerHTML = html;
  while (div.children.length > 0) {
    parent.appendChild(div.children[0]);
  }
  div.remove();
}

const releaseNoteTemplate = `<h5 class="change text-white-50a mx-auto mt-2 mb-2"><span class="badge badge-@COLOR mr-2">@TYPE</span>@NOTE (Thanks to <a href='https://github.com/@AUTHOR'>@@AUTHOR</a> for PR <a href='https://github.com/shanalikhan/code-settings-sync/pull/@PR'>#@PR</a>)</h5>`;

const notesElement = document.querySelector("#notes");
releaseNotes.changes.forEach(change => {
  const html = releaseNoteTemplate
    .replace(new RegExp("@NOTE", "g"), change.details)
    .replace(new RegExp("@TYPE", "g"), change.type)
    .replace(new RegExp("@COLOR", "g"), change.color)
    .replace(new RegExp("@AUTHOR", "g"), change.author)
    .replace(new RegExp("@PR", "g"), change.pullRequest);
  appendHTML(notesElement, html);
});

const currentVersionElement = document.querySelector("#current-version");
currentVersionElement.innerHTML = releaseNotes.currentVersion;
