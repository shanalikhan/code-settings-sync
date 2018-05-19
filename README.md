# Settings Sync



**Previously known as Visual Studio Code Settings Sync**

[![Version](https://vsmarketplacebadge.apphb.com/version/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync) [![Travis](https://img.shields.io/travis/rust-lang/rust.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)
[![Greenkeeper badge](https://badges.greenkeeper.io/shanalikhan/code-settings-sync.svg)](https://greenkeeper.io/)


<a href="https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk">
<img src="https://shanalikhan.github.io/img/slack.PNG" alt="Drawing" style="width: 150px;"/>
</a>


**Type Sync in command Palette in order to view all commands.**

## Key Features

```
1. Use your GitHub account token and Gist.
2. Easy to Upload and Download on one click.
3. Show a summary page at the end with details about config and extensions effected.
4. Auto Download Latest Settings on Startup.
5. Auto upload Settings on file change.
6. Share the Gist with other users and let them download your settings.
7. Supports GitHub Enterprise
```


## It Syncs
```
All extensions and complete User Folder that Contains
1. Settings File
2. Keybinding File
3. Launch File
4. Snippets Folder
5. VSCode Extensions Settings
6. Workspaces Folder
```

## Shortcuts
```
1. Upload Key : Shift + Alt + U
2. Download Key : Shift + Alt + D
```




## Steps To Get a Personal Access Token from GitHub

This extension requires a Personal Access Token from your GitHub account. You can create one by simply following the steps shown in the pictures below. Make sure you add **Gist** in scope.

**Go to [Settings](https://github.com/settings) / [Developer settings](https://github.com/settings/tokens) / [Personal access tokens](https://github.com/settings/tokens) / Generate New Token**


![Goto Settings / Developer settings / Personal Access Tokens](https://shanalikhan.github.io/img/github1.PNG)

**Select Gist From Scopes.**

![Select Scopes](https://shanalikhan.github.io/img/github2.PNG)

**Get an Access Token.**

![Get Access Token](https://shanalikhan.github.io/img/github3.PNG)


> Save the Token somewhere for future use (i.e. to upload from other machines).


## Upload Your Settings For the first time

**Press Shift + Alt + U it will ask your GitHub account access token.**

> Type ">Sync" In Command Palette into order download / upload

This will automatically open your GitHub settings page, allowing you to generate a new token for the application, as explained in the previous section. This token will allow the extension to create gists.

Enter the GitHub token in the window and click enter.

![github account access token](https://shanalikhan.github.io/img/upload1.png)

**Upload your settings automatically and the extension gives you Gist ID in the system message.**
Gist ID is needed to access the data you have uploaded with your token. Copy this Gist ID in order to download the settings to other machines.

![uploaded automatically](https://shanalikhan.github.io/img/upload2.png)

You can always **verify created gist** on the following url:

> https://gist.github.com/{your_userName}/{gist_id}

Here is the gif of the complete process when you execute the Upload command (Might take some time to load)

![Upload](https://media.giphy.com/media/xT9IglKxSqs2Wdwq2c/source.gif)

## Download your Settings

**Press Shift + Alt + D it will ask your GitHub Gist ID.**

> Type ">Sync" In Command Palette into order download / upload

**Enter Your GitHub Token.**

Enter the GitHub token in the window and click enter.

![github account access token](https://shanalikhan.github.io/img/upload1.png)

**Enter Your Gist ID.**

You need to enter your Gist ID in order to download the files you have uploaded with Shift + Alt + U.

![Enter Your Gist ID](https://shanalikhan.github.io/img/download2.png)

**Settings Downloaded.**
You are Done! All your files are downloaded

![Enter Your Gist ID](https://shanalikhan.github.io/img/download3.png)

Here is the gif of the complete process when you execute the Download command (Might take time to load)


![Download](https://media.giphy.com/media/xT9Iglsi3CS9noE8tW/source.gif)


## Reset Token / Gist Settings

> Type ">Sync" In Command Palette and select Reset Token and Gist Settings


## Toggle Auto Download

Auto Download is **disabled by default**. It will sync all the setting by default when the editor starts.
Please make sure you have valid github Token and Gist available to make it work properly.

Select Command **"Sync : Advanced Options > Toggle Auto-Download On Startup"** command to Turn ON / OFF the auto download.

## Toggle Force Download

Force Download is **disabled by default**. By default, extension won't download the latest settings if you already have the latest downloaded version, but sometimes when you delete some extension locally and don't upload the settings it will still show that you have latest versions by date or time checks, by turning this ON it will always download the cloud settings on startup.

Please make sure you have valid github Token and Gist available to make it work properly.

Select Command **"Sync : Advanced Options > Toggle Force Download"** command to Turn ON / OFF the force download.

## Toggle Auto-Upload on change

Auto-upload is **disabled by default**. When the settings are changed and saved this feature will automatically start the upload process and save the settings online.

Please make sure you have valid github Token and Gist available to make it work properly.

Select Command **"Sync : Advanced Options > Toggle Auto-Upload on Settings Change"** command to Turn ON / OFF the auto-upload.


## Toggle Summary

Summary is **enabled by default** which shows all files and extensions that are added or deleted on a single page.
You may turn it off in order to make a upload and download process clean and quiet.

Select Command **"Sync : Advanced Options > Show Summary Page On Upload / Download"** command to Turn ON / OFF the auto download.

## Create Public Gist To Share Settings

By default, it creates secret Gist so only you can see it but if you want to share your Gist with other users, you can set it to public.
You can't change the exiting Gist type from secret to public so it will reset the Gist ID so you can create new Gist with all existing editor settings.

Select Command **"Sync : Advanced Options > Share Settings with Public GIST"**

Other users can give your Gist Id to download the Gist, but they can't upload their settings on your Gist.


## Settings


For details regarding settings keys, click [here](https://medium.com/@itsShanKhan/visual-studio-code-settings-sync-configurations-ed8dd6fd9753)

```json
    "sync.gist": "0c929b1a6c51015cdc9e0fe2e369ea4c",
    "sync.lastUpload": "2018-03-04T14:21:39.841Z",
    "sync.autoDownload": false,
    "sync.autoUpload": false,
    "sync.lastDownload": "2018-03-04T14:21:39.841Z",
    "sync.forceDownload": true,
    "sync.host": "",
    "sync.pathPrefix": "",
    "sync.quietSync": false,
    "sync.askGistName": false,
    "sync.removeExtensions": true,
    "sync.syncExtensions": true
```

## Customized Sync

Extension will create the `syncLocalSettings.json` inside `User` folder upon code start. <br>
On Windows, this is `%APPDATA%\Code\User\syncLocalSettings.json`. <br>
Mac, `$HOME/Library/Application Support/Code/User/syncLocalSettings.json`. <br>
Linux, `~/.config/Code/User/syncLocalSettings.json`. <br>

You can customize the sync:

```
1. Options by which files / folders and settings to exclude from upload.
2. The Gist Description when creating new Gist.
3. Replace the code settings after downloading.
4. Change the Gist description while creating new one in github.
```

The JSON will be created as:

```json
{
    "ignoreUploadFiles": [ "projects.json", "projects_cache_vscode.json",
        "projects_cache_git.json", "projects_cache_svn.json", "gpm_projects.json",
        "gpm-recentItems.json"
    ],
    "ignoreUploadFolders": [
        "workspaceStorage"
    ],
    "ignoreExtensions": [
        "ignored_extension_name"
    ],
    "replaceCodeSettings": {
         "http.proxy": "http://my.proxy.address:8080"
    },
    "gistDescription": "Visual Studio Code Settings Sync Gist",
    "version": 290,
    "token": "YOUR_GITHUB_TOKEN_HERE",
    "downloadPublicGist": false,
    "supportedFileExtensions": [
        "json", "code-snippets"
    ]
}
```

For settings details, visit my post [here](https://medium.com/@itsShanKhan/visual-studio-code-settings-sync-configurations-ed8dd6fd9753)


## How To Contribute

You can contribute in different ways. Read the details [here](https://github.com/shanalikhan/code-settings-sync/blob/master/CONTRIBUTING.md)



## Credits

### Contributors

Thank you to all the people who have already contributed to Settings Sync!
<a href="graphs/contributors"><img src="https://opencollective.com/code-settings-sync/contributors.svg?width=890" /></a>

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

<a href="https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk">
<img src="https://shanalikhan.github.io/img/slack.PNG" alt="Drawing" style="width: 150px;"/>
</a>
