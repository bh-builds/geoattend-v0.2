# GeoAttend local dependencies

The application loads Leaflet, face-api.js, and face recognition model weights from this repository. It no longer loads these libraries or model files from public CDNs at runtime.

## Automatic setup on GitHub

1. Upload the project to the `main` or `master` branch.
2. In GitHub, open **Settings → Actions → General → Workflow permissions** and allow read/write repository permissions if the workflow is not permitted to push.
3. The **Vendor browser dependencies** workflow downloads the pinned libraries and model weights into `vendor/` and `models/`, then commits them. GitHub Pages will deploy the new commit.
4. Check the workflow run and confirm that `vendor/.complete` and the model files are present in the repository.

You can also run `node scripts/vendor-dependencies.mjs` locally before uploading. Set `FORCE_VENDOR=1` to refresh the downloaded files.

## External services that remain

- Google Apps Script remains the attendance/configuration backend.
- OpenStreetMap's public tile service remains the map data provider. The map needs internet access and must follow the tile usage policy.

These are runtime services, not JavaScript/CSS dependencies. The project does not require a Google Maps API key.
