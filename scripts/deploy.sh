npm i --no-optional
npm dedupe
npm up
npm install -g vsce
printf $VSCE_TOKEN | vsce login "Shan"
vsce publish
