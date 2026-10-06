# A demo people can open immediately

Demo address: **https://buzburg.github.io/trigger-tangle/**. The owner authorized making TriggerTangle public and publishing this GitHub Pages demo on October 6, 2026.

`npm run build` now creates `dist/site/index.html` alongside the offline app and CLI. This is the same standalone app, ready for a static host: no API, environment variables, database or server process. Keep the complete original offline release available as a download.

## Publish a verified update

1. Push the intended source update to `main` and run **Publish demo** from the repository's Actions tab. It only deploys this repository's `main` branch.
2. The workflow installs pinned dependencies, audits them, checks types, runs unit and Chromium/Firefox tests, and uploads **only `dist/site`**. It does not upload `.state`, local reports or customer blueprints.
3. A separate job deploys that tested artifact to the `github-pages` environment using narrowly scoped Pages permissions. Pull requests and ordinary pushes cannot start a deployment. See [GitHub's custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
4. Open the resulting HTTPS address while signed out. Check the default loop, build a custom sync, enable its marker guard, and download a report. Verify the browser makes no application network calls after loading the page.
5. Add the verified demo URL to the repository About field, README and approved announcement. Never present a localhost address or an inaccessible private release as a public demo.

No deployment is triggered by pushing source changes. GitHub receives ordinary page requests and may keep access logs; the app itself has no analytics or runtime network requests. Sharing a report exposes the supplied blueprint and sample fields, so demonstrate with synthetic data.

To restore an earlier version, revert the relevant app change on `main`, verify it and run **Publish demo** again. Repository releases and the hosted demo are separate deliveries; publishing a release does not update Pages.
