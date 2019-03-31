# Settings Sync [![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=Synchronize%20your%20%40VisualStudio%20%40code%20Settings%20Across%20Multiple%20Machines%20using%20%40github%20GIST%20by%20%40itsShanKhan&url=https://github.com/shanalikhan/code-settings-sync&via=code&hashtags=code,vscode,SettingsSync,developers) [![Follow](https://img.shields.io/twitter/follow/itsShanKhan.svg?style=social&label=Follow)](https://twitter.com/intent/follow?screen_name=itsShanKhan)

**Previously known as Visual Studio Code Settings Sync**

[![Version](https://vsmarketplacebadge.apphb.com/version/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync) [![Travis](https://img.shields.io/travis/rust-lang/rust.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)
[![Greenkeeper badge](https://badges.greenkeeper.io/shanalikhan/code-settings-sync.svg)](https://greenkeeper.io/)
[![Master course](https://img.shields.io/badge/Supported%20by-VSCode%20Power%20User%20Course%20%E2%86%92-gray.svg?colorA=444444&colorB=4F44D6)](https://t.co/8BEMyhpKU5?amp=1)

## Support

While being free and open source, if you find it useful, please consider supporting it by donating via PayPal or Open Collective. If you are using it in office as a team, please ask your company to support us via Open Collective from just 2\$ per month!

<table align="center" width="60%" border="0">
  <tr>
    <td>
      <a href="https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=4W3EWHHBSYMM8&lc=IE&item_name=Code%20Settings%20Sync&item_number=visual%20studio%20code%20settings%20sync&currency_code=USD&bn=PP%2dDonationsBF%3abtn_donate_SM%2egif%3aNonHosted">
          <img src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif"/>
      </a>
      <br>
    </td>
      <td> 
        <a href="https://opencollective.com/code-settings-sync/order/3848" target="_blank">
            <img src="https://opencollective.com/webpack/donate/button.png?color=blue" width=200 />
        </a>
          <br>
          *2$ Per Month
      </td>
     
  </tr>
</table>
<br>
 <a href="https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk">
<img src="https://i.imgur.com/1QWdtcX.png" alt="Drawing" style="width: 150px;"/>
</a>
<br>
<br>

**Type Sync in command Palette in order to view all commands.**

## Key Features

```
1. Sync using a Git repository or GitHub Gist
2. Easy to Upload and Download on one click.
3. Show a summary page at the end with details about config and extensions effected.
4. Auto download Latest Settings on Startup.
5. Auto upload Settings on file change.
6. Share the Gist with other users and let them download your settings.
7. Supports GitHub Enterprise
8. Support pragmas with @sync keywords: host, os and env are supported.
9. Intuitive GUI for settings
```

## It Syncs

Gist:

```
1. Settings File
2. Keybinding File
3. Launch File
4. Snippets Folder
5. VSCode Extensions & Extensions Configurations
```

Repo:

```
1. Settings File
2. Keybinding File
3. Launch File
4. Snippets Folder
5. VSCode Extensions & Extensions Configurations
6. Any other custom file
```

## Shortcuts

```
1. Upload Key : Shift + Alt + U
2. Download Key : Shift + Alt + D
```

## Setup

This extension requires a Personal Access Token from your GitHub account. You can create one by simply following the steps shown in the pictures below. Make sure you add **Gist** and/or **Repo** in scope, depending on which one you want to use.

**Go to [Settings](https://github.com/settings) / [Developer settings](https://github.com/settings/tokens) / [Personal access tokens](https://github.com/settings/tokens) / Generate New Token**

![Goto Settings / Developer settings / Personal Access Tokens](https://shanalikhan.github.io/img/github1.PNG)

**Select `Gist` and/or `Repo` From Scopes.**

![Select Scopes](https://shanalikhan.github.io/img/github2.PNG)

**Get an Access Token.**

![Get Access Token](https://shanalikhan.github.io/img/github3.PNG)

> Save the Token somewhere for future use (i.e. to upload from other machines).

### Gist

**Insert the Access Token into the `GitHub Token` field under `Gist Settings` in Settings**

##### You can get to Settings by going to >Sync: Advanced Options -> Open Settings Page

![Insert the Access Token into the Token field in Settings](https://i.imgur.com/VHL3eUE.jpg)

### Repo

**Create a new GitHub repository**

1. Go to [GitHub](https://github.com) and create a new private repository
2. Get the repository's url without 'https://' (e.g. github.com/user/repo.git)

**Insert the GitHub Repo URL, GitHub Token, and your GitHub Username into their appropriate fields under `Repo Settings` in Settings**
![Insert the Access Token into the Token field in Settings](https://i.imgur.com/te6wKtl.jpg)

## Reset Settings

> Type ">Sync" In Command Palette and select Reset Settings

## Toggle Auto Download

Auto Download is **disabled by default**. It will sync all the setting by default when the editor starts.
Please make sure you have valid github Token and Gist available to make it work properly.

Select Command **"Sync: Advanced Options > Open Settings Page"** and enable `Auto Download`

## Toggle Force Download

Force Download is **disabled by default**. By default, extension won't download the latest settings if you already have the latest downloaded version, but sometimes when you delete some extension locally and don't upload the settings it will still show that you have latest versions by date or time checks, by turning this ON it will always download the cloud settings on startup.

Please make sure you have valid github Token and Gist available to make it work properly.

Select Command **"Sync: Advanced Options > Open Settings Page"** and enable `Force Download`

## Toggle Auto-Upload on change

Auto-upload is **disabled by default**. When the settings are changed and saved this feature will automatically start the upload process and save the settings online.

Please make sure you have valid github Token and Gist available to make it work properly.

Select Command **"Sync: Advanced Options > Open Settings Page"** and enable `Auto Upload`

## Toggle Summary

Summary is **enabled by default** which shows all files and extensions that are added or deleted on a single page.
You may turn it off in order to make a upload and download process clean and quiet.

Select Command **"Sync: Advanced Options > Open Settings Page"** and enable `Quiet Sync`

## Create Public Gist To Share Settings

By default, it creates secret Gist so only you can see it but if you want to share your Gist with other users, you can set it to public.
You can't change the exiting Gist type from secret to public so it will reset the Gist ID so you can create new Gist with all existing editor settings.

Select Command **"Sync: Advanced Options > Share Settings with Public GIST"**

Other users can give your Gist Id to download the Gist, but they can't upload their settings on your Gist.

## Settings

To change the settings, select Command **"Sync: Advanced Options > Open Settings Page"**

Settings are present in `syncLocalSettings.json` inside `User` folder. These settings will be shared across multiple Gist Environments.

On Windows, this is `%APPDATA%\Code\User\syncLocalSettings.json`.

Mac, `$HOME/Library/Application Support/Code/User/syncLocalSettings.json`.

Linux, `~/.config/Code/User/syncLocalSettings.json`.

You can customize the sync:

```
1. Options by which files / folders and settings to exclude from upload.
2. Configure default Gist Environment name.
3. Replace the code settings after downloading.
4. Change the Gist description while creating new one in github.
5. Configure Github Enterprise Url
```

```js
{
  "repoSettings": {
    "repo": "",
    "token": "",
    "username": ""
  },
  "gistSettings": {
    "gist": "",
    "customFiles": [],
    "githubEnterpriseUrl": null,
    "askGistName": false,
    "downloadPublicGist": false,
    "token": "",
    "supportedFileExtensions": ["json", "code-snippets"],
    "openTokenLink": true,
    "gistDescription": "Visual Studio Code Settings Sync Gist",
    "lastUpload": null,
    "lastDownload": null,
    "ignoreUploadSettings": []
  },
  "ignoredItems": [
    ".git",
    "syncLocalSettings.json",
    "sync.lock",
    "workspaceStorage",
    "globalStorage/state.vscdb",
    "globalStorage/state.vscdb.backup",
    "projects.json",
    "projects_cache_vscode.json",
    "projects_cache_git.json",
    "projects_cache_svn.json",
    "gpm_projects.json",
    "gpm-recentItems.json"
  ],
  "version": 327,
  "hostname": "",
  "ignoredExtensions": [],
  "syncMethod": "gist",
  "autoDownload": false,
  "autoUpload": false,
  "forceDownload": false,
  "quietSync": false,
  "removeExtensions": true,
  "syncExtensions": true,
  "disableUpdateMessage": true
}
```

I will recommend you to read the configurations details [here](https://medium.com/@itsShanKhan/visual-studio-code-settings-sync-configurations-ed8dd6fd9753).

### Troubleshooting

If you ever get into problem while setting up the Settings Sync. You can check our troubleshooting guide that cover those scenarios [here](https://github.com/shanalikhan/code-settings-sync/wiki/Troubleshooting), you can also add your solution there if its not available there to help other users.

## How To Contribute

You can contribute in different ways. Read the details [here](https://github.com/shanalikhan/code-settings-sync/blob/master/CONTRIBUTING.md)

**Fix and Earn** - You can also earn money by fixing the issues - Check the issues under bounty program [here](https://github.com/shanalikhan/code-settings-sync/labels/bounty).

## Credits

### Contributors

Thank you to all the people who have already contributed to Settings Sync!
<a href="https://github.com/shanalikhan/code-settings-sync/graphs/contributors"><img src="https://opencollective.com/code-settings-sync/contributors.svg?width=890" /></a>

### Backers

Thank you to all our backers! [[Become a backer](https://opencollective.com/code-settings-sync#backer)]

<a href="https://opencollective.com/code-settings-sync#backers" target="_blank"><img src="https://opencollective.com/code-settings-sync/backers.svg?width=890"></a>
[<img src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif">](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=4W3EWHHBSYMM8&lc=IE&item_name=Code%20Settings%20Sync&item_number=visual%20studio%20code%20settings%20sync&currency_code=USD&bn=PP%2dDonationsBF%3abtn_donate_SM%2egif%3aNonHosted)

### Sponsors

Thank you to all our sponsors! (please ask your company to also support this open source project by [becoming a sponsor](https://opencollective.com/code-settings-sync))

## [Contributors](https://github.com/shanalikhan/code-settings-sync/graphs/contributors)

# [Release Notes](https://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html)

# License

[![Version](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/shanalikhan/code-settings-sync/blob/master/LICENSE)

[![Version](https://vsmarketplacebadge.apphb.com/version/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)

[![Installs](https://vsmarketplacebadge.apphb.com/installs/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)

[![Ratings](https://vsmarketplacebadge.apphb.com/rating/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)

[![Master course](https://img.shields.io/badge/Supported%20by-VSCode%20Power%20User%20Course%20%E2%86%92-gray.svg?colorA=444444&colorB=4F44D6)](https://t.co/8BEMyhpKU5?amp=1)

<a href="https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk">
<img src="https://shanalikhan.github.io/img/slack.PNG" alt="Drawing" style="width: 150px;"/>
</a>
