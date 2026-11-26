# coulaislab.com

Website of the Machine Materials Lab (Corentin Coulais, Institute of Physics, University of Amsterdam).

It is a static site: plain text files (Markdown and YAML) are turned into HTML pages by one
Python script, `build.py`. There is no database, no WordPress, and nothing to update or patch.

## Preview on your computer

```bash
python3 build.py serve
```

Then open <http://localhost:8000>. Every time you save a file, the site rebuilds; reload the
browser to see the change. Press Ctrl+C to stop. (If you edit `build.py` itself, restart this command.)

The first time on a new computer: `pip install -r requirements.txt`.

## Where things are

| What you want to change          | File                                         |
| -------------------------------- | -------------------------------------------- |
| Research highlights (news posts) | `content/news/YYYY-MM-DD-some-title.md`      |
| People, master students, alumni  | `data/people.yaml`                           |
| Publications                     | `data/publications.yaml`                     |
| Awards, grants and careers       | `data/awards.yaml`                           |
| Gallery                          | `data/gallery.yaml`                          |
| Press coverage                   | `data/press.yaml`                            |
| Lab equipment                    | `data/lab.yaml`                              |
| PhD graduations                  | `data/theses.yaml`                           |
| About page text                  | `content/pages/about.md`                     |
| Menu, contact, homepage text and animations | `content/site.yaml`               |
| Images, PDFs, videos             | `static/uploads/` (referenced as `/uploads/…`) |
| Layout and design                | `templates/*.html`, `static/css/style.css`   |

## Common tasks

**Add a research highlight.** Create `content/news/2026-12-01-my-result.md`:

```markdown
---
title: My new result
date: 2026-12-01
image: /uploads/2026/12/figure.jpg
---

We discover that … Out in [Nature Physics](https://www.nature.com/…)!

{{< youtube VIDEO_ID >}}
```

Put the image in `static/uploads/2026/12/`. `image` is optional: it is shown at the top of the post
and on the homepage card (without it, the first image in the text is used for the card).
The card summary is the first paragraph. Videos: `{{< youtube ID >}}`, `{{< youtube-playlist ID >}}`
or `{{< video /uploads/2026/12/movie.mp4 >}}` (a video file that isn't there yet is simply skipped).
`image_caption:` adds a caption under the top image. Add `draft: true` to hide a post.

**Add a publication.** Copy an entry at the top of `data/publications.yaml`:

```yaml
- year: 2026            # or: forthcoming
  title: Title of the paper
  citation: Author A., Coulais C. and Author B., *Nat. Phys.* 22, 123 (2026)
  links:
  - label: preprint
    url: https://arxiv.org/abs/…
  - label: www
    url: https://doi.org/…
```

`*text*` is italic. Write a literal asterisk (equal contribution) as `\*`.
The numbers [1], [2], … are assigned automatically (newest = highest), so you never renumber
by hand.

**Add a picture to the gallery.** Put the file in `static/uploads/` and add an entry at the top
of `data/gallery.yaml` (image, caption, and optionally a link to the related post).

**Homepage photos.** The photos at the top of the homepage cross-fade every 7 seconds. They are
listed in `content/site.yaml` under `hero: slides:`, each with a caption and a link to the related
post; the first one is shown first. To add one, copy a block. Pick a picture at least 1600 pixels
wide (landscape works best); the left side is darkened so the text stays readable. If the
interesting part gets cropped away, add `position:` (for example `50% 20%` keeps the top).

**Homepage animations.** The three interactive animations (rotating squares; two motorised hinges
obeying the odd constitutive law; chameleon) take turns in the "About the lab" section of the homepage
and in the "Play with our metamaterials" section of the About page. Their captions
and "read more" links are in `content/site.yaml` under `hero: visuals:`. To start on a specific one,
link to `/#visual=odd` (or `squares`, `chameleon`).

**Press page.** Archived for now: it is not in the menu and is not built, but `data/press.yaml` and
`templates/press.html` are kept. To bring it back, see the comment in the `PAGES` list in `build.py`.

**Add a group member.** Copy a block in `data/people.yaml` under `members:` and put the photo in
`static/uploads/`. The first member is shown as the PI. To move someone to alumni, delete their
block and add a line at the top of the right group under `alumni:` (postdocs, PhD, MSc/BSc students).

## Publishing (GitHub Pages, free)

1. Create a repository on GitHub and push this folder to its `main` branch.
2. In the repository: **Settings → Pages → Source: GitHub Actions**.
3. Every push to `main` now rebuilds and publishes the site (see `.github/workflows/deploy.yml`).
   You can also edit files directly on github.com; saving a change publishes it.

### Pointing coulaislab.com to the new site

The domain is registered with WordPress.com (Automattic) and paid until 3 November 2027.

1. In GitHub: **Settings → Pages → Custom domain**: enter `coulaislab.com`, then tick
   **Enforce HTTPS** once the certificate is ready.
2. In WordPress.com: **Upgrades → Domains → coulaislab.com → DNS records**, replace the
   existing A records for the root domain with GitHub's:

   ```
   A     @    185.199.108.153
   A     @    185.199.109.153
   A     @    185.199.110.153
   A     @    185.199.111.153
   CNAME www  <your-github-username>.github.io
   ```

3. Once the new site shows up at coulaislab.com, you can cancel the WordPress.com hosting plan.
   Keep the domain registration (or transfer it to another registrar first; see below).

Optionally, move the domain to a cheaper registrar (e.g. Cloudflare, Porkbun, Namecheap): unlock
it and request the transfer (EPP/auth) code in WordPress.com, then start the transfer at the
new registrar. Recreate the DNS records above there.

## Old URLs

All old WordPress addresses keep working: `/about/`, `/group/`, `/publications/`,
`/our-lab/`, `/phd-graduations/`, `/awards-distinctions-and-grants/`, and every post at
`/YYYY/MM/DD/slug/`. Files that were on WordPress now live under `/uploads/`.

## Backup of the old site

`archive/` (not uploaded to GitHub) holds a full export of the WordPress site: page and post
contents as JSON (`archive/raw/`) and all original, full-resolution media (`archive/media/`),
plus the scripts used for the migration (`archive/migration/`).
