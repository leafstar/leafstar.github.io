---
title: "README"
permalink: "/about/"
layout: page
---

## Overview

This repository contains my academic website built with Jekyll and hosted on GitHub Pages.

The site includes:

- a homepage with my biography and academic timeline
- a `News` section for short updates
- a `Blog` page for posts
- an education map showing the key places in my academic journey

## Local Development

To run the site locally:

```powershell
bundle install
bundle exec jekyll serve
```

Then open `http://127.0.0.1:4000`.

## Content Editing

- Update homepage content in `index.md`
- Update news items in `_data/news.yml`
- Update education map locations in `_data/visitor_locations.yml`
- Update navigation and site metadata in `_config.yml`
- Add posts in `_posts/`

## Deployment

The site is deployed through GitHub Pages from the `master` branch.

After making changes:

```powershell
git add .
git commit -m "Update website content"
git push origin master
```

## Notes

- The site theme is based on the Contrast Jekyll theme and has been customized for my academic homepage.
- The map on the homepage is currently a static map of my education history, not a visitor tracker.
