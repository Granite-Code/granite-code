## Where to contribute

- **New Features**: [Continue](https://github.com/continuedev/continue)
- **UI Improvements**: [Continue](https://github.com/continuedev/continue)
- **Most bug fixes**: [Continue](https://github.com/continuedev/continue)
- **Granite.Code specific UI**: [continue-for-granite](https://github.com/Granite-Code/continue-for-granite/). Submit a pull request to the `granite/customization` branch.
- **Extension build problems**: this repository

The general message is that most development occurs in Continue.

We do track upstream bugs, UI improvements, and features
that we think are relevant for Granite.Code.
See the [Issues for this repository](https://github.com/Granite-Code/granite-code/issues).

If you are working on one of those,
please feel to ask questions on the issue,
and if you submit a PR, please put a link to it in the issue,
and we can help review.

To run upstream Continue
with the same models and other configuration that Granite.Code uses,
use the "Granite.Code: write Continue config" command.

## Formatting

Granite.Code uses [Prettier](https://prettier.io/) with the settings in [.prettierrc](.prettierrc).

If you are using vscode (or a variant)

- Make sure you have [prettier-vscode](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) installed
- Set it as the default formatter
- Turn on "Format on Save"

This is set up in this repositories [.vscode/settings.json](.vscode/settings.json), so should work by default.

If you are using a different editor, please run:

```
npm run fix-coding-style
```

before committing your changes.
