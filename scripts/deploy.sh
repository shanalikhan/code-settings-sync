npm install node-pre-gyp
npm i --no-optional
npm dedupe
npm up
npm install -g vsce
printf "Applying Token"
printf $VSCE_TOKEN
printf $VSCE_TOKEN | vsce login "Shan"
vsce publish
