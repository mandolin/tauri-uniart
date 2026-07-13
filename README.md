# Tauri UniArt

Tauri UniArt is an independent desktop application for the UnicodeArtJs
ecosystem. Its goal is to provide a focused Unicode character art workstation
with a native desktop shell.

## Relationship to UnicodeArtJs

The application will use the published `unicode-art-js` Core package as its
conversion engine. It does not duplicate the Core source code or change the
licenses of the published UnicodeArtJs packages.

## License and Distribution

The source code in this repository is MIT licensed. Each application release
will include the notices and license materials required by its real dependency
graph and packaged runtime.

The shared policy is documented in the
[UnicodeArtJs compatible-project guide](https://github.com/mandolin/UnicodeArtJs/blob/main/docs/compatible-project-guide.md).

## Status

The repository contains the P1.1 secure desktop shell: a TypeScript/Vite window
with a minimal Tauri capability set, no custom Rust commands, no opener plugin,
and no release bundle. Conversion workflows, project files, and packaging are
implemented in later stages. No application package has been released yet.

## Development

The repository uses mise to keep the Node and Rust toolchains reproducible:

```powershell
mise install
mise exec -- npm install
mise exec -- npm run tauri:dev
```

Use `mise exec -- npm run check` for TypeScript and frontend checks. The
`tauri:build` command intentionally uses `--no-bundle` until the Compatible
distribution gate has approved an actual installer configuration.
