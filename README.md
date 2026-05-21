# Muxing Wang Academic Website

This repository contains the source for [leafstar.github.io](https://leafstar.github.io), my academic homepage hosted with GitHub Pages.

The site is built with Jekyll and a customized Contrast-style layout. It is intentionally lightweight: most content lives in `index.md`, styling lives in Sass, and deployment happens directly from the `master` branch.

## Features

- Academic homepage with biography, research interests, publications, education, and service.
- Research interests rendered as compact badge-style tags.
- Fixed RPG-style HUD bar with quick links to CV, blog, Google Scholar, GitHub, and email.
- Keyboard shortcuts for HUD actions:
  - `D`: CV
  - `T`: Blog
  - `E`: Google Scholar
  - `F`: GitHub
  - `W`: Email
- GoatCounter analytics for privacy-friendly visit tracking.
- Public visit count in the lower-right counter.
- Visitor country codes shown from a generated static JSON file.
- GitHub Action that periodically refreshes visitor country data from GoatCounter.

## Repository Layout

```text
.
|-- index.md                                  # Homepage content and HUD markup
|-- _config.yml                               # Jekyll metadata, navigation, analytics config
|-- _layouts/default.html                     # Shared HTML shell, analytics, counters
|-- _sass/homepage.sass                       # Homepage, badge, HUD, and responsive styling
|-- assets/data/visitor-countries.json        # Generated visitor country summary
|-- scripts/update_visitor_countries.py       # GoatCounter country stats fetcher
`-- .github/workflows/update-visitor-countries.yml
```

## Local Development

Install Ruby dependencies:

```powershell
bundle install
```

Build the site:

```powershell
bundle exec jekyll build
```

Run a local preview server:

```powershell
bundle exec jekyll serve --host 127.0.0.1 --port 4000
```

Then open:

```text
http://127.0.0.1:4000/
```

## Editing Content

Most homepage content is in:

```text
index.md
```

Common edits:

- Biography: edit the `.profile` section in `index.md`.
- Research interests: edit the `<ul class="research-badges">` list in `index.md`.
- Publications: edit the `#publications` section in `index.md`.
- Education: edit the `#education` section in `index.md`.
- Academic service: edit the `#services` section in `index.md`.
- HUD links and hotkeys: edit the HUD block near the bottom of `index.md`.
- Visual styling: edit `_sass/homepage.sass`.
- Header navigation and GoatCounter site code: edit `_config.yml`.

## Analytics

The site uses [GoatCounter](https://www.goatcounter.com/) through:

```yaml
goatcounter_code: "leafstar"
```

The main tracking script is injected from `_layouts/default.html`.

The lower-right counter displays:

- total visits from GoatCounter's public counter endpoint
- top visitor country codes from `assets/data/visitor-countries.json`

For the public visit count to work, GoatCounter must have this setting enabled:

```text
Allow adding visitor counts on your website
```

## Visitor Countries

Visitor countries are not fetched directly from the browser because GoatCounter statistics require an API token. Instead, the repository uses GitHub Actions:

```text
.github/workflows/update-visitor-countries.yml
```

The workflow runs every six hours and can also be triggered manually from the GitHub Actions tab. It calls:

```text
scripts/update_visitor_countries.py
```

The script reads GoatCounter location statistics and writes:

```text
assets/data/visitor-countries.json
```

The website reads that static JSON file and displays up to five country codes in the lower-right counter.

The workflow requires a repository secret:

```text
GOATCOUNTER_TOKEN
```

Recommended GoatCounter token permissions:

```text
Read statistics
Access to site: leafstar.goatcounter.com
```

Do not commit API tokens to this repository.

## Deployment

The site is deployed by GitHub Pages from the `master` branch.

Typical update flow:

```powershell
bundle exec jekyll build
git status
git add -- <changed-files>
git commit -m "Describe the update"
git push origin master
```

After pushing, GitHub Pages will rebuild and publish the site. If a CSS or layout change does not appear immediately, hard refresh the browser or wait for the GitHub Pages cache to update.

## Notes

- `_site/` is generated output and is ignored by Git.
- `.claude/` is local tooling state and should not be committed unless intentionally needed.
- GoatCounter country data is approximate and should be treated as a high-level signal, not precise geolocation.
