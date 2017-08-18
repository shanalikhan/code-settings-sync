# Settings Sync

### Previously known as Visual Studio Code Settings Sync

[![Version](https://vsmarketplacebadge.apphb.com/version/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync) [![Travis](https://img.shields.io/travis/rust-lang/rust.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync) [![Join Chat](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/code-settings-sync)



**Type Sync in command Palette in order to view all commands.**

## Key Features

```
1. Use your GitHub account token and Gist.
2. Can create Anonymous Gist without using your GitHub account token.
3. Easy to Upload and Download on one click.
4. Show a summary page at the end with details about config and extensions effected.
5. Auto Download Latest Settings on Startup.
6. Auto upload Settings on file change.
7. Share the Gist with other users and let them download your settings.
8. Supports GitHub Enterprise
```


## It Syncs
```
All extensions and complete User Folder that Contains
1. Settings File
2. Keybinding File
3. Launch File
4. Snippets Folder
5. VSCode Extensions Settings
6. Workspaces
```

## Shortcuts
```
1. Upload Key : Shift + Alt + U
2. Download Key : Shift + Alt + D
```




## Steps To Get the GitHub Key.

This extension requires your GitHub Account Personal Access Token. You can create one simple by looking into the following pictures. Make sure you add **Gist** in scope.

**Go to [Settings](https://github.com/settings) / [Personal Access Tokens](https://github.com/settings/tokens) / Generate New Token**


![Goto Settings / Personal Access Tokens](https://shanalikhan.github.io/img/github1.PNG)

**Select Gist From Scopes**

![Select Scopes](https://shanalikhan.github.io/img/github2.PNG)

**Get Unique Key**

![Get Unique Key](https://shanalikhan.github.io/img/github3.PNG)


> Save the Key somewhere for future use.


## Upload Your Settings For the first time


**Press Shift + Alt + U it will ask your GitHub account access token.**

> Type ">Sync" In Command Palette into order download / upload

Enter the GitHub account in the window and click enter.

![github account access token](https://shanalikhan.github.io/img/upload1.png)

**Upload your settings automatically and give you Gist ID.**
Copy this Gist ID in order to download the settings in other machines.

![uploaded automatically](https://shanalikhan.github.io/img/upload2.png)

You can always **verify created gist** on the following url :

> https://gist.github.com/<your_userName>/<gist_id>

## Download your Settings

**Press Shift + Alt + D it will ask your GitHub Gist ID.**

> Type ">Sync" In Command Palette into order download / upload

**Enter Your Gist ID.**
you need to enter your Gist ID in order to get all files

![Enter Your Gist ID](https://shanalikhan.github.io/img/download2.png)

**Settings Downloaded.**
You are Done! All your files are downloaded

![Enter Your Gist ID](https://shanalikhan.github.io/img/download3.png)

## Reset Token / Gist Settings

> Type ">Sync" In Command Palette and select Reset Token and Gist Settings

## Creating and Downloading Settings From Anonymous Gist

Anonymous Gist is **Turned Off** by default. GitHub provides a way to create Anonymous Gist so you can create Anonymous Gist without adding your account information (token). But you can't change Anonymous Gist once created, its the limitation from the GitHub so extension will always create new Anonymous Gist upon uploading the settings, you can download the settings from any Anonymous Gist without adding your account information.

To turn on the Anonymous Gist , set `sync.anonymousGist` to true

## Toggle Auto Download

Auto Download is **disabled by default**. It will sync all the setting by default when the editor starts.
Please make sure you have valid github Token and Gist available to make it work properly.

Select Command **"Sync : Advance Options > Toggle Auto-Download On Startup"** command to Turn ON / OFF the auto download.

## Toggle Force Download

Force Download is **disabled by default**. By default, extension won't download the latest settings if you already have the latest downloaded version, but sometimes when you delete some extension locally and don't upload the settings it will still show that you have latest versions by date or time checks, by turning this ON it will always download the cloud settings on startup.

Please make sure you have valid github Token and Gist available to make it work properly.

Select Command **"Sync : Advance Options > Toggle Force Download"** command to Turn ON / OFF the force download.

## Toggle Auto-Upload on change

Auto-upload is **disabled by default**. When the settings are changed and saved this feature will automatically start the upload process and save the settings online.

Please make sure you have valid github Token and Gist available to make it work properly.

Select Command **"Sync : Advance Options > Toggle Auto-Upload on Setting Change"** command to Turn ON / OFF the auto-upload.


## Toggle Summary

Summary is **enabled by default** which shows all files and extensions that are added or deleted on a single page.
You may turn it off in order to make a upload and download process clean and quiet.

Select Command **"Sync : Advance Options > Toggle Summary Page On Upload / Download"** command to Turn ON / OFF the auto download.

## Create Public Gist To Share Settings

By default, it creates secret Gist so only you can see it but if you want to share your Gist with other users, you can set it to public.
You can't change the exiting Gist type from secret to public so it will reset the Gist ID so you can create new Gist with all existing editor settings.

Select Command **"Sync : Advance Options > Share Settings with Public GIST"**

Other users can give your Gist Id to download the Gist, but they can't upload their settings on your Gist.


## Settings


For details regarding settings keys, click [here](https://shanalikhan.github.io/2016/07/31/Visual-Studio-code-sync-setting-edit-manually.html)

```json
    "sync.gist": "",
    "sync.lastUpload": "2016-12-27T16:34:19.308Z",
    "sync.lastDownload": "2016-12-27T15:58:35.760Z",
    "sync.autoDownload": false,
    "sync.autoUpload": false,
    "sync.forceDownload": true,
    "sync.anonymousGist": false
    "sync.host":"",
    "sync.pathPrefix":"",
    "sync.quietSync":false
```

## Customized Sync

Extension will create the `syncLocalSettings.json` insider `User` folder upon code start.
You can customize the sync:

```
1. Options by which files / folders and settings to exclude from upload.
2. The Gist Description when creating new Gist.
3. Replace the code settings after downloading.
4. Change the Gist description while creating new one in github.
```

The Json will be created as:

```json
{
    "token":"YOUR_GITHUB_TOKEN_HERE",
    "version" : 270,
    "ignoreUploadFiles": ["projects.json", "projects_cache_git.json"],
    "ignoreUploadFolders": ["workspaceStorage"],
    "replaceCodeSettings": {
        "http.proxy": "XYZ"
    },
    "gistDescription": "Visual Studio Code Settings Sync Gist"
}
```

For details about customized sync, visit my post [here](https://shanalikhan.github.io/2017/02/19/Option-to-ignore-settings-folders-code-settings-sync.html)


# How To Contribute

If you have any idea, you can open an issue on the GitHub repository so we can further discuss it or you can send me a pull request.

## Through Code

Download source code and install dependencies

```
git clone https://github.com/shanalikhan/code-settings-sync.git
cd code-settings-sync
npm install
code .
```
Make the respective code changes.

Go to the debugger in VS Code, choose `Launch Extension` and click run. You can test your changes.

Submit a Pull Request.

## Through Donation

If you are enjoying this extension. What about donating, Your donation will help me to keep working and supporting this project.

[<img src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif">](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=4W3EWHHBSYMM8&lc=IE&item_name=Code%20Settings%20Sync&item_number=visual%20studio%20code%20settings%20sync&currency_code=USD&bn=PP%2dDonationsBF%3abtn_donate_SM%2egif%3aNonHosted)



## [Contributors](https://github.com/shanalikhan/code-settings-sync/graphs/contributors)
# [Release Notes](https://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html)

# License
MIT

[![Version](https://vsmarketplacebadge.apphb.com/version/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)

[![Installs](https://vsmarketplacebadge.apphb.com/installs/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)

[![Ratings](https://vsmarketplacebadge.apphb.com/rating/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)
