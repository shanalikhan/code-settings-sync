#### Version - 3.1.2
* Extension CLI Download Improvements.

#### Version - 3.1.1
* Fixed : Extension Download fails for Code Insiders and mac Users [#618](https://github.com/shanalikhan/code-settings-sync/issues/618)
* Fixed : Upload issues for mac [#622](https://github.com/shanalikhan/code-settings-sync/issues/622)


#### Version - 3.1.0
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

#### Version - 3.0.0

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

