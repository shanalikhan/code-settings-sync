// @ts-nocheck
const vscode = acquireVsCodeApi();
function logInWithGitHub() {
  vscode.postMessage({});
}

(() => {
  let deg = 0;
  let mouseover = false;

  $(".animated-logo").hover(
    () => (mouseover = true),
    () => (mouseover = false)
  );

  setInterval(() => {
    if (mouseover) {
      $(".animated-logo").css("transform", `rotate(${deg}deg)`);
      deg += 5;
    }
  }, 20);
})();
