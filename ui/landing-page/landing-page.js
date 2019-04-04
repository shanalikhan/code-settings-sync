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
