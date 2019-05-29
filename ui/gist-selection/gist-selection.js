// @ts-nocheck

const vscode = acquireVsCodeApi();

/* https://stackoverflow.com/questions/3177836/how-to-format-time-since-xxx-e-g-4-minutes-ago-similar-to-stack-exchange-site */
function timeSince(date) {
  var seconds = Math.floor((new Date() - date) / 1000);

  var interval = Math.floor(seconds / 31536000);

  if (interval > 1) {
    return interval + " years";
  }
  interval = Math.floor(seconds / 2592000);
  if (interval > 1) {
    return interval + " months";
  }
  interval = Math.floor(seconds / 86400);
  if (interval > 1) {
    return interval + " days";
  }
  interval = Math.floor(seconds / 3600);
  if (interval > 1) {
    return interval + " hours";
  }
  interval = Math.floor(seconds / 60);
  if (interval > 1) {
    return interval + " minutes";
  }
  return Math.floor(seconds) + " seconds";
}

function appendHTML(parent, html) {
  var div = document.createElement("div");
  div.innerHTML = html;
  while (div.children.length > 0) {
    parent.appendChild(div.children[0]);
  }
  div.remove();
}

function saveGistId(id) {
  vscode.postMessage({ id });
  $("#modal").modal();
}

const selectionContainer = document.querySelector("#selectionContainer");

document
  .querySelector(".modal-content")
  .classList.add(
    document.body.className.includes("vscode-dark") ? "bg-dark" : "bg-light"
  );

const selectionTemplate = `
<button type="button" onclick="saveGistId('@id')" class="list-group-item list-group-item-action">@description (@id) – Updated @timestamp ago</button>`;

gists.forEach(gist => {
  const html = selectionTemplate
    .replace(new RegExp("@description", "g"), gist.description)
    .replace(new RegExp("@id", "g"), gist.id)
    .replace(
      new RegExp("@timestamp", "g"),
      timeSince(new Date(gist.updated_at))
    );
  appendHTML(selectionContainer, html);
});
