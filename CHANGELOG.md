# ChangeLog : Settings Sync [![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=Synchronize%20your%20%40VisualStudio%20%40code%20Settings%20Across%20Multiple%20Machines%20using%20%40github%20GIST%20by%20%40itsShanKhan&url=https://github.com/shanalikhan/code-settings-sync&via=code&hashtags=code,vscode,SettingsSync,developers) [![Follow](https://img.shields.io/twitter/follow/itsShanKhan.svg?style=social&label=Follow)](https://twitter.com/intent/follow?screen_name=itsShanKhan)

[![Version](https://vsmarketplacebadge.apphb.com/version/Shan.code-settings-sync.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync) [![Travis](https://img.shields.io/travis/rust-lang/rust.svg)](https://marketplace.visualstudio.com/items?itemName=Shan.code-settings-sync) [![Master course](https://img.shields.io/badge/Supported%20by-VSCode%20Power%20User%20Course%20%E2%86%92-gray.svg?colorA=444444&colorB=4F44D6)](https://t.co/8BEMyhpKU5?amp=1)

#### v3.2.9 - April 18,2019

* Bug : Fixed Code that kills Extension Host for MacOS [#827](https://github.com/shanalikhan/code-settings-sync/issues/827) - Thanks for PR [#834](https://github.com/shanalikhan/code-settings-sync/pull/834) by [@arnohovhannisyan](https://github.com/arnohovhannisyan)
* Bug : Download From Public Gist not working [#816](https://github.com/shanalikhan/code-settings-sync/issues/816)
* Bug : Auto Upload Fix [#832](https://github.com/shanalikhan/code-settings-sync/issues/832) - Thanks for PR [#835](https://github.com/shanalikhan/code-settings-sync/pull/835) by [@arnohovhannisyan](https://github.com/arnohovhannisyan)
* Improvement - Inserts some empty lines in the beginning of `settings.json` [#819](https://github.com/shanalikhan/code-settings-sync/issues/819) - Thanks for PR [#828](https://github.com/shanalikhan/code-settings-sync/pull/828) by [@arnohovhannisyan](https://github.com/arnohovhannisyan)
* Wiki : Update Documentation - Thanks for PR [#828](https://github.com/shanalikhan/code-settings-sync/pull/845) by [@colinaaa](https://github.com/colinaaa)

#### v3.2.8 - April 04,2019

* Bug : auto upload doesn't work when make change on settings [#801](https://github.com/shanalikhan/code-settings-sync/issues/801) -  Thanks for PR [#807](https://github.com/shanalikhan/code-settings-sync/pull/807) by [@arnohovhannisyan](https://github.com/arnohovhannisyan)
* Bug : Auto Upload / Download : Disable change detection for workspace storage folder [#708](https://github.com/shanalikhan/code-settings-sync/issues/708) -  Thanks for PR [#811](https://github.com/shanalikhan/code-settings-sync/pull/811) by [@knyhle](https://github.com/knyhle)
* Pretiffy Custom Settings JSON -  Thanks for PR [#812](https://github.com/shanalikhan/code-settings-sync/pull/812) by [@knyhle](https://github.com/knyhle)
* Improvement - Remove manual visx package installation in favour of extension download by CLI [#820](https://github.com/shanalikhan/code-settings-sync/issues/820)
* Improvement - Remove replaceCodeSettings from Settings Sync configurations [#805](https://github.com/shanalikhan/code-settings-sync/issues/805)

#### v3.2.7 - March 06,2019

* Bug : Fixing Extensions Sync on Windows [#789](https://github.com/shanalikhan/code-settings-sync/issues/789) -  Thanks for PR [#791](https://github.com/shanalikhan/code-settings-sync/pull/791) by [@LuisUrrutia](https://github.com/LuisUrrutia)

#### v3.2.6 - March 05,2019

* Bug : Syncing of extensions not working in portable mode [#756](https://github.com/shanalikhan/code-settings-sync/issues/756) -  Thanks for PR [#782](https://github.com/shanalikhan/code-settings-sync/pull/782) by [@LuisUrrutia](https://github.com/LuisUrrutia)
* Bug : Fixing NODE_TLS_REJECT_UNAUTHORIZED [#776](https://github.com/shanalikhan/code-settings-sync/issues/776) -  Thanks for PR [#779](https://github.com/shanalikhan/code-settings-sync/pull/779) by [@MattMorgis](https://github.com/MattMorgis)
* Documentation Updated
* Packages Updated

#### v3.2.5 - Feb 15,2019

* Bug : Not working with VSCode 1.31 [#762](https://github.com/shanalikhan/code-settings-sync/issues/762) -  Thanks for PR [#763](https://github.com/shanalikhan/code-settings-sync/pull/763) by [@nekonenene](https://github.com/nekonenene)
* Bug : Multi-line settings aren't ignored properly using sync pragma [#701](https://github.com/shanalikhan/code-settings-sync/issues/701) -  Thanks for PR [#750](https://github.com/shanalikhan/code-settings-sync/pull/750) by [@ioprotium](https://github.com/ioprotium)
* Packages updated, small improvements

#### v3.2.3 - 11 Dec, 2018

* Startup : Long startup activation time on the first start [#656](https://github.com/shanalikhan/code-settings-sync/issues/656) -  Thanks for PR [#717](https://github.com/shanalikhan/code-settings-sync/pull/717) by [@thejewdude](https://github.com/thejewdude)
* Feature : Adding coder.com support [#714](https://github.com/shanalikhan/code-settings-sync/issues/714) - Thanks for PR [#720](https://github.com/shanalikhan/code-settings-sync/pull/720) by [@deansheather](https://github.com/deansheather)

#### v3.2.2 - 26 Nov, 2018

* Sync Advance Setting Menu doesnt open when JSON not Valid [#683](https://github.com/shanalikhan/code-settings-sync/issues/683)

#### v3.2.1 - 23 Nov, 2018

* Bug : Only install missing extensions in Portable Vs Code [#687](https://github.com/shanalikhan/code-settings-sync/issues/687)
* Bug : Error: Cannot read property 'token' of undefined [#685](https://github.com/shanalikhan/code-settings-sync/issues/685)
* Bug : sync-ignore isn't ignoring my local value, it deletes it [#686](https://github.com/shanalikhan/code-settings-sync/issues/686)
* Bug : Download of extension packages failed [#642](https://github.com/shanalikhan/code-settings-sync/issues/642) - Thanks for PR [#705](https://github.com/shanalikhan/code-settings-sync/pull/705) by [@emptyother](https://github.com/emptyother)


#### v3.2.0 - 17 Oct, 2018

* Prompt to reload VSCode after installing extensions [#629](https://github.com/shanalikhan/code-settings-sync/issues/629)
* Keep output of CLI installation command [#628](https://github.com/shanalikhan/code-settings-sync/issues/628)
* Dont write default settings sync config to code settings.json [#513](https://github.com/shanalikhan/code-settings-sync/issues/513)
* vscodium download settings fails [#650](https://github.com/shanalikhan/code-settings-sync/issues/650) - Thanks for PR [#651](https://github.com/shanalikhan/code-settings-sync/pull/651) by [@stripedpajamas](https://github.com/stripedpajamas)
* Does not work with Portable Visual Studio Code [#331](https://github.com/shanalikhan/code-settings-sync/issues/331)
* Flatpak Support for Settings Sync [#621](https://github.com/shanalikhan/code-settings-sync/issues/621) - Thanks for PR [#657](https://github.com/shanalikhan/code-settings-sync/pull/657) by [@laloch](https://github.com/laloch)
* Per-platform / per-hostname inline settings [#640](https://github.com/shanalikhan/code-settings-sync/issues/640) - Thanks for PR [#667](https://github.com/shanalikhan/code-settings-sync/pull/667) by [@ioprotium](https://github.com/ioprotium)
* Idea/Suggestion: Adds support to sync custom files [#258](https://github.com/shanalikhan/code-settings-sync/issues/258) - Thanks for PR [#258](https://github.com/shanalikhan/code-settings-sync/pull/258) by [@tkrtmy](https://github.com/tkrtmy)


#### v3.1.2
* Extension CLI Download Improvements.

#### v3.1.1
* Fixed : Extension Download fails for Code Insiders and mac Users [#618](https://github.com/shanalikhan/code-settings-sync/issues/618)
* Fixed : Upload issues for mac [#622](https://github.com/shanalikhan/code-settings-sync/issues/622)


#### v3.1.0
* Option to Install Extensions Using CLI [#434](https://github.com/shanalikhan/code-settings-sync/issues/434)
    - Code Team hasn't provided API to install extension, but as CLI is available Settings Sync will start using code cli to download extensions. Live Status will be displayed while downloading.
    - Note : This feature wont work in Mac as I cant test on Mac. You will be facing problems, for this I need Mac users to help and fix it.
    - Fixes : [#337](https://github.com/shanalikhan/code-settings-sync/issues/337), [#566](https://github.com/shanalikhan/code-settings-sync/issues/566) and [#577](https://github.com/shanalikhan/code-settings-sync/issues/577)
* Unify the code style by using tslint and prettier - Thanks for PR [#595](https://github.com/shanalikhan/code-settings-sync/pull/595) by [@axetroy](https://github.com/axetroy)
    - Fixes : [#578](https://github.com/shanalikhan/code-settings-sync/issues/578), [#597](https://github.com/shanalikhan/code-settings-sync/issues/597), [#486](https://github.com/shanalikhan/code-settings-sync/issues/486) by upgrading all the packages like Github Api.
* Don't introduce "sync.*" settings which is equal to default behavior after DL/UL - [#513](https://github.com/shanalikhan/code-settings-sync/issues/513)
    - Settings Sync configuration has been changed, Readme is updated.
* Added German localization - Thanks for PR [#588](https://github.com/shanalikhan/code-settings-sync/pull/588) by [@ljosberinn](https://github.com/ljosberinn)
* Missing partial i18n translation - Thanks for PR [#593](https://github.com/shanalikhan/code-settings-sync/pull/593) by [@axetroy](https://github.com/axetroy)
* Documentation Improvement - Thanks for PR [#603](https://github.com/shanalikhan/code-settings-sync/pull/603) by [@MastaCoder](https://github.com/MastaCoder)
* Fix slack img in README and Update tutorial message - Thanks for PR [#607](https://github.com/shanalikhan/code-settings-sync/pull/607) and [#608](https://github.com/shanalikhan/code-settings-sync/pull/608) by [@fr3fou](https://github.com/fr3fou)
* Ignored extensions can be accidentally deleted if removeExtensions is enabled. - Thanks for PR [#604](https://github.com/shanalikhan/code-settings-sync/pull/604) by [@leepowellcouk](https://github.com/leepowellcouk)
* Error Translation - Thanks for PR [#616](https://github.com/shanalikhan/code-settings-sync/pull/616) by [@Xiongqi-XQ](https://github.com/Xiongqi-XQ)

#### v3.0.0

* Bug Fix for OSS Variant  [#549](https://github.com/shanalikhan/code-settings-sync/issues/549) - Thanks for PR [@rudfoss](https://github.com/rudfoss)
* Support i18n for extension - Currently Supports English and Chinese [#581](https://github.com/shanalikhan/code-settings-sync/issues/581) - Thanks for PR [@axetroy](https://github.com/axetroy)
* Added Functionality to ignore extension in settings sync [#523](https://github.com/shanalikhan/code-settings-sync/pull/523) - Thanks for PR [@leepowellcouk](https://github.com/leepowellcouk)
* Setting to disable opening of github page [#576](https://github.com/shanalikhan/code-settings-sync/pull/576)
* Update adm-zip to the latest version [#551](https://github.com/shanalikhan/code-settings-sync/pull/551)

For Previous releases change log view the [post](http://shanalikhan.github.io/2016/05/14/Visual-studio-code-sync-settings-release-notes.html)


## [Contributions](https://github.com/shanalikhan/code-settings-sync/blob/master/CONTRIBUTING.md)

### Financial

[<img src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif">](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=4W3EWHHBSYMM8&lc=IE&item_name=Code%20Settings%20Sync&item_number=visual%20studio%20code%20settings%20sync&currency_code=USD&bn=PP%2dDonationsBF%3abtn_donate_SM%2egif%3aNonHosted)

I also welcome financial contributions in case of special feature requests on my [open collective](https://opencollective.com/code-settings-sync).

### Community

You may join slack community and disscus the ideas over there.

<a href="https://join.slack.com/t/codesettingssync/shared_invite/enQtMzE3MjY5NTczNDMwLTYwMTIwNGExOGE2MTJkZWU0OTU5MmI3ZTc4N2JkZjhjMzY1OTk5OGExZjkwMDMzMDU4ZTBlYjk5MGQwZmMyNzk">
<img src="https://i.imgur.com/1QWdtcX.png" alt="Drawing" style="width: 150px;"/>
</a>

I'm looking for contributors to work with me so we can make the extension smoother and more feature rich.
Let me know if anyone is willing to [contribute](https://github.com/shanalikhan/code-settings-sync/blob/master/CONTRIBUTING.md).

