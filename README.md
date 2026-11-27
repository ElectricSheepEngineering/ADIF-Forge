# ADIF Forge

ADIF Forge is a bulk editor for an amateur radio log stored as ADIF. Open a log, edit QSOs in a grid, apply the same change to many QSOs, and save ADIF or export CSV.

## Installation

### Download a release

Each git tag builds standalone executables and attaches them to that tag's GitHub release. Download the file for your machine:

| System | Asset |
| --- | --- |
| macOS, Apple silicon | `adif-forge-darwin-aarch64` |
| macOS, Intel | `adif-forge-darwin-x64` |
| Linux, x64 | `adif-forge-linux-x64` |
| Windows, x64 | `adif-forge-windows-x64.exe` |

These are unsigned executables, not installers. On macOS and Linux, mark the file executable and run it:

```sh
chmod +x adif-forge-darwin-aarch64
./adif-forge-darwin-aarch64
```

Use the asset name you downloaded. macOS may refuse an unsigned download until you allow it in Privacy & Security.

### Build from source

You need Git, a current Rust stable toolchain (`rustup`), and Node.js LTS with npm.

On Debian or Ubuntu, install the WebKit and GTK libraries Tauri links against:

```sh
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf build-essential
```

On macOS, install the Xcode Command Line Tools. On Windows, install Visual Studio Build Tools with the Desktop development with C++ workload, and the WebView2 runtime.

Then:

```sh
git clone https://github.com/ElectricSheepEngineering/ADIF-Forge.git
cd ADIF-Forge
npm ci
npm run tauri dev
```

`npm run tauri dev` starts the desktop app with a live frontend. `npm test` runs the logbook tests. `npm run tauri build` produces a release build for the current machine.

## Usage

Open an `.adi` or `.adif` file, or start from the empty log and add QSOs. **Save** writes the open log back to ADIF. The first save asks for a path. **Merge** appends the QSOs from another ADIF file. **CSV** writes the whole log as comma-separated values.

Double-click a cell to edit it. Enter keeps the value. Escape leaves the cell unchanged. Click a field name to sort. The search box hides QSOs that do not match. Type the text as it appears, or use `/pattern/` or `/pattern/i` for a regular expression.

Checkboxes select QSOs. Bulk edits use a scope: the QSOs the grid is showing, the selected QSOs, or every QSO.

- **New QSO** appends a contact dated now.
- **Find Dupes** selects later QSOs that share callsign, band, mode, date, and the hour and minute of start time with an earlier QSO. The earliest QSO in that run is left unselected. A QSO with no callsign is not a duplicate.
- **Delete** removes the selected QSOs.
- **Fill / Case** writes one value into a field, optionally only where that field is empty, or changes the field to upper or lower case.
- **Find & Replace** replaces text in one field. The find box accepts plain text or `/pattern/`.
- **Derive / Copy Field** fills `BAND` from `FREQ`, fills a typical `FREQ` from `BAND`, copies one field into another, sets `TIME_OFF` from `TIME_ON`, or rewrites short `TIME_ON` and `TIME_OFF` values as six-digit times.
- **Columns** adds, reorders, splits, or drops fields. Dropping a field removes it from every QSO.
- **Tools**, in the status bar, sorts by date and time, duplicates or moves selected QSOs, selects every QSO that matches the search, saves or splits off the selection, copies ADIF or CSV, pastes ADIF from the clipboard, and reloads the file. It also shows counts by band and mode.

Undo and redo cover the last edits of this session. Parser warnings, such as a field with a bad length, appear above the grid. The rest of the file still loads.

## License

ADIF Forge is licensed under the GNU General Public License version 3. See [LICENSE.md](LICENSE.md).
