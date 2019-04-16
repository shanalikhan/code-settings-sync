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

const releaseNoteTemplate = `<h5 class="change text-white-50 mx-auto mt-2 mb-2"><span class="badge badge-@COLOR mr-2">@TYPE</span>@NOTE</h5>`;

const notesElement = document.getElementById("notes");
releaseNotes.changes.forEach(change => {
  const html = releaseNoteTemplate
    .replace(new RegExp("@NOTE", "g"), change.details)
    .replace(new RegExp("@TYPE", "g"), change.type)
    .replace(new RegExp("@COLOR", "g"), change.color);
  appendHTML(notesElement, html);
});

const currentVersionElement = document.getElementById("current-version");
currentVersionElement.innerHTML = releaseNotes.currentVersion;
