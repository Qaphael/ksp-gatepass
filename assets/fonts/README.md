# Embedded ticket fonts

The ticket renderer embeds these static TrueType faces in generated PDFs:

- Source Sans 3 regular and bold for primary text.
- Source Code Pro regular and bold for serials and other monospace fields.

Both families are licensed under the SIL Open Font License 1.1. The corresponding upstream license texts are kept next to the fonts. Files were fetched from Adobe's official font repositories at these immutable release-branch commits:

- `adobe-fonts/source-sans`, commit `87b37a2daaed80fcb8e8ccb0085c4d72ddade12`.
- `adobe-fonts/source-code-pro`, commit `803b7e23ec97ae58b6232ea76519a76d428ba268`.

The Docker runner copies this directory explicitly. Runtime resolution is relative to the application root (`process.cwd()/assets/fonts`).
