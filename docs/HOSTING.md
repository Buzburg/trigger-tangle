# A demo people can open immediately

The demo is prepared locally; it has not been published. The repository remains private under its owner's existing instruction. Publishing the demo or making the repository public requires the owner's approval.

`npm run build` now creates `dist/site/index.html` alongside the offline app and CLI. This is the same standalone app, ready for a static host: no API, environment variables, database or server process. Keep the complete original offline release available as a download.

## Publishing after approval

1. Run `npm ci --ignore-scripts` and `npm run check` on the intended release.
2. Upload **only `dist/site`** to the approved static host. Do not upload the repository, `.state`, local reports or customer blueprints.
3. If using GitHub Pages, publish that directory as the site artifact. GitHub Free supports Pages from public repositories; private-repository Pages requires an eligible paid plan. A published site can be public even when the source repository is private. See [GitHub Pages documentation](https://docs.github.com/en/pages/quickstart).
4. Open the resulting HTTPS address while signed out. Check the default loop, build a custom sync, enable its marker guard, and download a report. Verify the browser makes no application network calls after loading the page.
5. Add the verified demo URL to the repository About field, README and approved announcement. Never present a localhost address or an inaccessible private release as a public demo.

No deployment is triggered by pushing source changes. A host will receive ordinary page requests and may keep access logs; the app itself has no analytics or network requests. Sharing a report exposes the supplied blueprint and sample fields, so demonstrate with synthetic data.
