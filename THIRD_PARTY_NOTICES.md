# UnicodeArt App Third-Party Notices

This notice accompanies UnicodeArt App `0.1.0-beta.1` candidate releases. It is distributed with the NSIS installer,
the release evidence, and the corresponding source revision.

## UnicodeArtJs Core

UnicodeArt App uses `unicode-art-js` as its conversion engine. UnicodeArtJs is distributed under the MIT License.

- Project: <https://github.com/mandolin/UnicodeArtJs>
- Package: <https://www.npmjs.com/package/unicode-art-js>
- Source license: <https://github.com/mandolin/UnicodeArtJs/blob/main/LICENSE>

## Tauri Runtime and Plugins

The application uses the Tauri framework and its official API, dialog, and filesystem plugins. Their source and
license information is available from the Tauri project and in the release-specific Cargo metadata evidence.

- Project: <https://github.com/tauri-apps/tauri>
- Source license: <https://github.com/tauri-apps/tauri/blob/dev/LICENSE_MIT>
- Alternative Apache-2.0 license: <https://github.com/tauri-apps/tauri/blob/dev/LICENSE_APACHE-2.0>

## Microsoft WebView2

The Beta installer does not embed a fixed WebView2 runtime. When the Evergreen runtime is absent, the NSIS installer
uses Microsoft's download bootstrapper. The bootstrapper, downloaded runtime, and their terms are provided by
Microsoft; they are not part of this repository's MIT source license.

- Runtime and license information: <https://developer.microsoft.com/microsoft-edge/webview2/>

## Release-Specific Inventory

Each candidate release must include its generated `node-runtime.cyclonedx.json`, `cargo-metadata.json`,
`release-contract.json`, `release-assets.json`, and `SHA256SUMS.txt`. Those files are the authoritative, versioned
inventory for transitive Node, Rust, platform, and binary dependencies. A release may not be published when its
evidence does not match the installer and lockfile hashes.

This notice records engineering attribution and release material requirements; it does not replace license texts or
professional legal advice for a specific distribution.
