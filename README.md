# Visual Studio Code Settings Sync

> Type ">Sync" In Command Palette in order to download / upload

## Key Features
```
1. Use your github account token.
2. Easy to Upload and Download on one click.
3. Saves all settings and snippets files.
4. Upload Key : Shift + Alt + u
5. Download Key : Shift + Alt + d
6. Download settings upon Visual Studio Code Startup.

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

This extension required your GitHub Account Personal Access Token. You can create one simple by looking into the following pictures.
**Goto Settings / Personal Access Tokens / Generate New Token**


![Goto Settings / Personal Access Tokens](http://shanalikhan.github.io/img/github1.PNG)

**Select Scopes**

![Select Scopes](http://shanalikhan.github.io/img/github2.PNG)

**Get Unique Key**

![Get Unique Key](http://shanalikhan.github.io/img/github3.PNG)


> You need to save this key for this extension for future use, and don't share this key with anyone as it will get your data without needing to log in.


## Upload Your Settings For the first time


**Press Shift + Alt + u it will ask your github account access token.**

> Type ">Sync" In Command Palette into order download / upload

Enter the github account in the window and click enter.

![github account access token](http://shanalikhan.github.io/img/upload1.png)

**Upload your settings automatically and give you GIST ID.**
Copy this Gist ID in order to download the settings in other machines.

![uploaded automatically](http://shanalikhan.github.io/img/upload2.png)


## Download your Settings

**Press Shift + Alt + d it will ask your github account access token.**

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

## Enable Auto Download
When token and GIST is filled up correctly, you can enable auto download the latest settings on the editor startup. This will save you to download all the settings from the cloud again and again in different systems. To enable :

**Select Command "Toggle Auto Download" command to Turn ON / OFF the auto download.**

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
