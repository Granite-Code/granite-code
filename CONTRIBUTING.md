## Formatting

Granite.Code uses [Prettier](https://prettier.io/) with the settings in [.prettierrc](.prettierrc).

If you are using vscode (or a variant)

- Make sure you have [prettier-vscode](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) installed
- Set it as the default formatter
- Turn on "Format on Save"

This is set up in this repositories [.vscode/settings.json](.vscode/settings.json), so should work by default.

If you are using a different editor, please run:

```
npm run prettier:fix
```

before committing your changes.
