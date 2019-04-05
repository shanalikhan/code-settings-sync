// @ts-nocheck

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
            <label for="setting:@correspondingSetting" class="text-white-50"
              >@name</label
            >
            <input
              type="text"
              class="form-control text"
              id="setting:@correspondingSetting"
              placeholder="@placeholder"
              setting="@correspondingSetting"
              settingType="@settingType"
            />
          </div>`;

const checkboxTemplate = `<div class="custom-control custom-checkbox my-1 mr-sm-2">
            <input
              class="custom-control-input checkbox"
              type="checkbox"
              id="setting:@correspondingSetting"
              setting="@correspondingSetting"
              settingType="@settingType"
            />
            <label
              for="setting:@correspondingSetting"
              class="custom-control-label text-white-50"
            >@name</label>
          </div>`;

const textareaTemplate = `<div class="form-group">
            <label
              for="setting:@correspondingSetting"
              class="text-white-50"
              >@name</label>
            <textarea
              class="form-control textarea"
              id="setting:@correspondingSetting"
              data-min-rows="1"
              placeholder="@placeholder"
              setting="@correspondingSetting"
              settingType="@settingType"
            ></textarea>
          </div>`;

const globalParent = document.getElementById("globalSettings");
const envParent = document.getElementById("environmentSettings");

globalMap.forEach(settingMap => {
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
    .replace(new RegExp("@name", "g"), settingMap.name)
    .replace(new RegExp("@placeholder", "g"), settingMap.placeholder)
    .replace(
      new RegExp("@correspondingSetting", "g"),
      settingMap.correspondingSetting
    )
    .replace(new RegExp("@settingType", "g"), "global");
  appendHTML(globalParent, html);
});

envMap.forEach(envMap => {
  let template;
  switch (envMap.type) {
    case 0:
      template = textInputTemplate;
      break;
    case 1:
      template = checkboxTemplate;
      break;
  }
  const html = template
    .replace(new RegExp("@name", "g"), envMap.name)
    .replace(new RegExp("@placeholder", "g"), envMap.placeholder)
    .replace(
      new RegExp("@correspondingSetting", "g"),
      envMap.correspondingSetting
    )
    .replace(new RegExp("@settingType", "g"), "env");
  appendHTML(envParent, html);
});

$(document).ready(function() {
  $(".text")
    .each((i, el) => {
      if ($(el).attr("settingType") === "global") {
        $(el).val(_.get(globalData, $(el).attr("setting")));
      } else {
        $(el).val(envData[$(el).attr("setting")]);
      }
    })
    .change(function() {
      let val = $(this).val();
      vscode.postMessage({
        command: $(this).attr("setting"),
        text: val,
        type: $(this).attr("settingType")
      });
    });
  $(".checkbox")
    .each((i, el) => {
      if ($(el).attr("settingType") === "global") {
        $(el).prop("checked", _.get(globalData, $(el).attr("setting")));
      } else {
        $(el).prop("checked", envData[$(el).attr("setting")]);
      }
    })
    .change(function() {
      let val = $(this).is(":checked");
      vscode.postMessage({
        command: $(this).attr("setting"),
        text: val,
        type: $(this).attr("settingType")
      });
    });
  $(".textarea")
    .each((i, el) => {
      let str = "";
      const items = _.get(globalData, $(el).attr("setting"));
      items.forEach(item => (str += item + "\n"));
      $(el).val(str.slice(0, -1));
      $(el).prop("rows", items.length);
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
        text: val,
        type: "global"
      });
    });
});
