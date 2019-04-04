// @ts-nocheck

String.prototype.replaceAll = function(search, replacement) {
  var target = this;
  return target.replace(new RegExp(search, "g"), replacement);
};

function appendHTML(parent, html) {
  var div = document.createElement("div");
  div.innerHTML = html;
  while (div.children.length > 0) {
    parent.appendChild(div.children[0]);
  }
  div.remove();
}

const vscode = acquireVsCodeApi();

const textInputTemplate = `<div class="form-group">
            <label for="setting:@correspondingSetting"
              >@name</label
            >
            <input
              type="text"
              class="form-control text"
              id="setting:@correspondingSetting"
              placeholder="@placeholder"
              setting="@correspondingSetting"
            />
          </div>`;

const checkboxTemplate = `<div class="custom-control custom-checkbox my-1 mr-sm-2">
            <input
              class="custom-control-input checkbox"
              type="checkbox"
              id="setting:@correspondingSetting"
              setting="@correspondingSetting"
            />
            <label for="setting:@correspondingSetting" class="custom-control-label">
              @name
            </label>
          </div>`;

const textareaTemplate = `<div class="form-group">
            <label for="setting:@correspondingSetting"
              >@name</label
            >
            <textarea
              class="form-control textarea"
              id="setting:@correspondingSetting"
              rows="3"
              data-min-rows="3"
              placeholder="@placeholder"
              setting="@correspondingSetting"
            ></textarea>
          </div>`;

const parent = document.getElementById("root");
settingsMap.forEach(settingMap => {
  let template;
  switch (settingMap.type) {
    case 0:
      template = textInputTemplate;
      break;
    case 1:
      template = checkboxTemplate;
      break;
    case 2:
      template = textareaTemplate;
      break;
  }
  const html = template
    .replaceAll("@name", settingMap.name)
    .replaceAll("@placeholder", settingMap.placeholder)
    .replaceAll("@correspondingSetting", settingMap.correspondingSetting);
  appendHTML(parent, html);
});

$(document).ready(function() {
  $(".text")
    .each((i, el) => {
      $(el).val(_.get(settings, $(el).attr("setting")));
    })
    .change(function() {
      let val = $(this).val();
      vscode.postMessage({
        command: $(this).attr("setting"),
        text: val
      });
    });
  $(".checkbox")
    .each((i, el) => {
      $(el).prop("checked", _.get(settings, $(el).attr("setting")));
    })
    .change(function() {
      let val = $(this).is(":checked");
      vscode.postMessage({
        command: $(this).attr("setting"),
        text: val
      });
    });
  $(".textarea")
    .each((i, el) => {
      let str = "";
      _.get(settings, $(el).attr("setting")).forEach(
        item => (str += item + "\n")
      );
      $(el).val(str);
    })
    .change(function() {
      let val = [];
      $(this)
        .val()
        .split("\n")
        .forEach(item => {
          if (item !== "") {
            val.push(item);
          }
        });
      vscode.postMessage({
        command: $(this).attr("setting"),
        text: val
      });
    });
});
