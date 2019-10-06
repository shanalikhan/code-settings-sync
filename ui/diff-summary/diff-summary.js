// @ts-nocheck
const vscode = acquireVsCodeApi();

function sendCommand(command, data) {
  vscode.postMessage({
    command,
    data
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

const diffListTemplate = `<h5 class="text-white-50a mx-auto mt-2 mb-2"><a href=# onclick="sendCommand('ShowDiff',{ fileName: '@GIST', syncMode: 'download'})">@GIST</a></h5>`;

const diffElement = document.querySelector("#diffFiles");
if(!diffGists.length) {
  appendHTML(
    selectionContainer,
    "<p>All settings in sync. No differences found.</p>"
  );
} else {
  diffGists.forEach(gistName => {
    const html = diffListTemplate
      .replace(new RegExp("@GIST", "g"), gistName);
    appendHTML(diffElement, html);
  });
}
