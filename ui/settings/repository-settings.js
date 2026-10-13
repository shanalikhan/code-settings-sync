// Reuse the VS Code connection established by settings.js.
(() => {
  const element = id => document.getElementById(id);
  const fields = {
    provider: "repository-provider",
    apiUrl: "repository-api",
    url: "repository-url",
    branch: "repository-branch",
    token: "repository-token"
  };
  function toggle() {
    element("repository-fields").hidden =
      element("sync-method").value !== "GitRepository";
  }
  function send(command) {
    element("repository-status").textContent = "Saving…";
    const data = {
      syncMethod: element("sync-method").value,
      name: element("repository-name").value
    };
    Object.keys(fields).forEach(key => {
      data[key] = element(fields[key]).value;
    });
    vscode.postMessage({ command, data });
  }
  element("sync-method").addEventListener("change", toggle);
  element("repository-provider").addEventListener("change", () => {
    element("repository-api").value =
      element("repository-provider").value === "gitlab"
        ? "https://gitlab.com/api/v4"
        : "https://api.github.com";
    element("repository-url").value = "";
    element("repository-token").value = "";
  });
  element("repository-settings").addEventListener("submit", event => {
    event.preventDefault();
    send("repository.save");
  });
  element("repository-create").addEventListener("click", () => {
    send("repository.create");
  });
  window.addEventListener("message", event => {
    const message = event.data;
    if (message.command === "repository.error") {
      element("repository-status").textContent = message.message;
    } else if (message.command === "repository.settings") {
      element("sync-method").value = message.syncMethod;
      for (const [key, id] of Object.entries(fields)) {
        element(id).value = message.data[key] || "";
      }
      element("repository-token-status").textContent = message.tokenSet
        ? "A repository token is saved locally."
        : "No repository token saved.";
      element("repository-status").textContent = "Storage settings loaded.";
      toggle();
    }
  });
  vscode.postMessage({ command: "repository.get" });
})();
