# Visual Studio Code Settings Sync

[![Version](https://vsmarketplacebadge.apphb.com/version/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)

[![Installs](https://vsmarketplacebadge.apphb.com/installs/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)

[![Ratings](https://vsmarketplacebadge.apphb.com/rating/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)


**Type Sync in command Palette in order to view all commands.**

## Key Features
```
1. Use your github account token and GIST.
2. Easy to Upload and Download on one click.
3. Upload Key : Shift + Alt + U
4. Download Key : Shift + Alt + D
5. Use Other User's Public GIST to completely sync your settings with them.
6. Show a summary page at the end with details.
7. Auto Download Latest Settings on Startup.
8. Auto upload Settings on file change.
```      

## It Syncs
```
1. Settings File
2. Keybinding File
3. Launch File
4. Snippets Folder
5. VSCode Extensions
```
   
## Steps To Get the Github Key.

This extension required your GitHub Account Personal Access Token. You can create one simple by looking into the following pictures. Make sure you add **GIST** in scope.

**Goto Settings / Personal Access Tokens / Generate New Token**


![Goto Settings / Personal Access Tokens](http://shanalikhan.github.io/img/github1.PNG)

**Select GIST From Scopes**

![Select Scopes](http://shanalikhan.github.io/img/github2.PNG)

**Get Unique Key**

![Get Unique Key](http://shanalikhan.github.io/img/github3.PNG)


> Save the Key somewhere for future use.


## Upload Your Settings For the first time


**Press Shift + Alt + U it will ask your github account access token.**

> Type ">Sync" In Command Palette into order download / upload

Enter the github account in the window and click enter.

![github account access token](http://shanalikhan.github.io/img/upload1.png)

**Upload your settings automatically and give you GIST ID.**
Copy this Gist ID in order to download the settings in other machines.

![uploaded automatically](http://shanalikhan.github.io/img/upload2.png)


## Download your Settings

**Press Shift + Alt + D it will ask your github account access token.**

> Type ">Sync" In Command Palette into order download / upload

Enter the github account in the window and click enter.

![github account access token](http://shanalikhan.github.io/img/upload1.png)

**Enter Your GIST ID.**
you need to enter your Gist ID in order to get the all files

![Enter Your GIST ID](http://shanalikhan.github.io/img/download2.png)

**Settings Downloaded.**
You are Done! All your files are downloaded

![Enter Your GIST ID](http://shanalikhan.github.io/img/download3.png)

## Reset Token / GIST Settings

> Type ">Sync" In Command Palette and select Reset Token and GIST Settings

## Toggle Auto Download

Auto Download is **enabled by default**. It will sync all the setting by default when the editor starts.
Please make sure you have valid github Token and GIST available to make it work properly.

Select Command **"Sync : Advance Options > Toggle Auto-Download On Startup"** command to Turn ON / OFF the auto download.

## Toggle Force Download

Force Download is **disabled by default**. By default extension wont download the latest settings if you already have latest downloaded version , but sometime when you delete some extension locally and dont upload the settings it will still show you have latest versions by date or time checks, by turning this ON it will always download the cloud settings on startup.

Please make sure you have valid github Token and GIST available to make it work properly.

Select Command **"Sync : Advance Options > Toggle Force Download"** command to Turn ON / OFF the force download.

## Toggle Auto-Upload on change
Auto-upload is **disabled by default**. When the settings are changed and saved this feature will automatic start the upload process and save the settings online.

Please make sure you have valid github Token and GIST available to make it work properly.

Select Command **"Sync : Advance Options > Toggle Auto-Upload on Setting Change"** command to Turn ON / OFF the auto-upload.



## Toggle Summary

Summary is **enabled by default** which shows all the files and extensions that are added or deleted in a single page.
You may turn it off in order to make a upload and download process clean and quiet.  

Select Command **"Sync : Advance Options > Toggle Summary Page On Upload / Download"** command to Turn ON / OFF the auto download.

## Create Public GIST To Share

By default, it creates secret GIST so only you can see it but if you want to share your GIST with other users, you can set it to public.
You can't change the exiting GIST type from secret to public so it will reset the GIST ID so you can create new GIST with all the existing editor settings.

Select Command **"Sync : Advance Options > Public / Private GIST Mode & Reset GIST"**

## Fetch Other User's Settings

You may give the GIST ID to other users , your friends or employees so they download each of the extensions or settings you upload but they cant edit your GIST or upload anything on your GIST.

Select Command **"Sync : Advance Options > Fetch Other User's Settings"**


# Step By Step Tutorial For 

[How to share your visual studio code settings](http://shanalikhan.github.io/2016/09/02/how-to-Share-visual-studio-code-settings.html)


# How To Contribute
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
   

    
# [Contributors](https://github.com/shanalikhan/code-settings-sync/graphs/contributors)
# [Release Notes](http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html)
    
# License
MIT

[![Version](https://vsmarketplacebadge.apphb.com/version/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)

[![Installs](https://vsmarketplacebadge.apphb.com/installs/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)

[![Ratings](https://vsmarketplacebadge.apphb.com/rating/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync)
