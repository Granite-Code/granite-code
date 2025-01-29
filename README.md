# Granite.Code

Granite.Code is a project by Red Hat and IBM
to create an open-source AI code assistant
using the IBM Granite model family,
with the models running locally on your system.

This repository is used to build the Granite.Code extension
for Visual Studio Code.

The Granite.Code vscode extension is based on
[Continue](https://github.com/continuedev/continue),C
but with a number of changes, including:

- A setup wizard that guides the user through downloading and installing Ollama and the Granite model.
- Granite models are automatically selected, and updated as new models are released.
- The UI is tweaked and streamlined for the specific use case.
- Branding is changed to distinguish our extension.
- Identifiers are modified to prevent conflicts with Continue. (Both can be installed at once, though only one coding assistant can be active at a time.)

The way that this is implemented
is that we have a
[downstream fork of Continue](https://github.com/Granite-Code/continue-for-granite/)
that adds the setup wizard, and the branding and UI tweaks.
That fork is then imported as a Git submodule of this repository and built into a VSCode extension.

During the build process,
identifiers like configuration keys and command IDs
are changed in the source code
from `continue.<whatever>` to `granite.<whatever>`.

## Contributing

See [CONTRIBUTING](./CONTRIBUTING.md)

## License

The code in this repository is licensed under the [Apache 2.0](./LICENSE), and Copyright 2025, Red Hat, Inc. and others.
