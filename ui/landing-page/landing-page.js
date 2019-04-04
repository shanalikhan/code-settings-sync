// @ts-nocheck
const vscode = acquireVsCodeApi();
function logInWithGitHub() {
  vscode.postMessage({});
}

function appendHTML(parent, html) {
  var div = document.createElement("div");
  div.innerHTML = html;
  while (div.children.length > 0) {
    parent.appendChild(div.children[0]);
  }
  div.remove();
}

const releaseNoteTemplate = `<h5 class="change text-white-50 mx-auto mt-2 mb-3">
@NOTE
</h5>`;

const notesElement = document.getElementById("notes");
releaseNotes.changes.forEach(change => {
  const html = releaseNoteTemplate.replace(new RegExp("@NOTE", "g"), change);
  appendHTML(notesElement, html);
});

const currentVersionElement = document.getElementById("current-version");
currentVersionElement.innerHTML = releaseNotes.currentVersion;
