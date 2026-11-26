#!/usr/bin/env python3
"""Build the Machine Materials Lab website (coulaislab.com).

    python3 build.py           build the site into _site/
    python3 build.py serve     build, preview at http://localhost:8000, rebuild on every save

Content lives in plain text files:
    content/site.yaml          site title, menu, contact details, homepage text
    content/news/*.md          research highlights (one Markdown file per post)
    content/pages/about.md     the About page
    data/*.yaml                people, publications, awards, press, lab equipment, PhD theses
    static/                    images, PDFs, CSS and JS (copied as-is)
    templates/                 HTML layout (Jinja2)

Needs: pip install -r requirements.txt   (jinja2, mistune, pyyaml)
"""
import datetime
import functools
import html
import http.server
import os
import re
import shutil
import sys
import threading
import time
from collections import OrderedDict
from xml.sax.saxutils import escape as xml_escape

import jinja2
import mistune
import yaml
from markupsafe import Markup

ROOT = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(ROOT, "content")
DATA = os.path.join(ROOT, "data")
TEMPLATES = os.path.join(ROOT, "templates")
STATIC = os.path.join(ROOT, "static")
OUT = os.path.join(ROOT, "_site")

# Pages built from a template + data file:  (url, template, menu section, title)
PAGES = [
    ("/about/", "about.html", "about", "About"),
    ("/group/", "people.html", "people", "People"),
    ("/phd-graduations/", "theses.html", "people", "PhD graduations"),
    ("/publications/", "publications.html", "publications", "Publications"),
    ("/gallery/", "gallery.html", "gallery", "Gallery"),
    ("/our-lab/", "lab.html", "lab", "Our lab"),
    ("/awards-distinctions-and-grants/", "awards.html", "awards", "Awards, grants and careers"),
    # Archived for now (data/press.yaml is out of date). To bring the page back, remove the # below
    # and add the Press item to the menu in content/site.yaml.
    # ("/press/", "press.html", "press", "Press"),
]

# --------------------------------------------------------------------------- Markdown

if hasattr(mistune, "create_markdown"):  # mistune 2.x / 3.x
    _markdown = mistune.create_markdown(escape=False, plugins=["strikethrough", "table", "url"])
else:  # mistune 0.8
    _markdown = mistune.Markdown(escape=False)

SHORTCODE = re.compile(r"\{\{<\s*([\w-]+)\s+(.*?)\s*>\}\}")


def shortcode_html(name, arg):
    """{{< youtube ID >}}, {{< youtube-playlist ID >}}, {{< video /uploads/file.mp4 >}}"""
    arg = arg.strip().strip('"')
    if name in ("youtube", "youtube-playlist"):
        thumb = "/uploads/yt/%s.jpg" % arg
        has_thumb = os.path.exists(os.path.join(STATIC, thumb.lstrip("/")))
        style = ' style="background-image:url(%s)"' % thumb if has_thumb else ""
        kind = "list" if name == "youtube-playlist" else "id"
        watch = ("https://www.youtube.com/playlist?list=" if kind == "list" else "https://www.youtube.com/watch?v=") + arg
        return (
            '<figure class="embed"><button type="button" class="yt-lite" data-yt-%s="%s"%s aria-label="Play video">'
            '<span class="yt-play" aria-hidden="true"></span><span class="yt-note">Plays from YouTube</span></button>'
            '<noscript><a href="%s">Watch on YouTube</a></noscript></figure>' % (kind, html.escape(arg), style, watch)
        )
    if name == "video":
        if arg.startswith("/") and not os.path.exists(os.path.join(STATIC, arg.lstrip("/"))):
            print("  note: video %s not found in static/ yet; skipped" % arg)
            return ""
        return ('<figure class="embed embed--video"><video controls preload="metadata" playsinline src="%s">'
                '</video></figure>' % html.escape(arg))
    raise ValueError("Unknown shortcode: %s" % name)


def markdown(text):
    blocks = []

    def stash(m):
        blocks.append(shortcode_html(m.group(1), m.group(2)))
        return "\n\nSHORTCODE%dXX\n\n" % (len(blocks) - 1)

    out = _markdown(SHORTCODE.sub(stash, text or ""))
    for i, block in enumerate(blocks):
        out = re.sub(r"(<p>)?SHORTCODE%dXX(</p>)?" % i, lambda _m, b=block: b, out)
    return out


def markdown_inline(text):
    out = markdown(text).strip()
    if out.startswith("<p>") and out.endswith("</p>") and out.count("<p>") == 1:
        out = out[3:-4]
    return out


def plain_text(md_text):
    t = SHORTCODE.sub("", md_text)
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"[*_`#>\\]", "", t).strip()


def summarize(md_text, limit=230):
    for para in re.split(r"\n\s*\n", md_text):
        t = re.sub(r"\s+", " ", plain_text(para))
        if len(t) > 20:
            if len(t) > limit:
                t = t[:limit].rsplit(" ", 1)[0].rstrip(",;:") + "…"
            return t
    return ""


# --------------------------------------------------------------------------- loading


def load_yaml(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def read_markdown_file(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
    if not m:
        return {}, text
    return yaml.safe_load(m.group(1)) or {}, m.group(2).strip()


def to_datetime(value):
    if isinstance(value, datetime.datetime):
        return value
    if isinstance(value, datetime.date):
        return datetime.datetime(value.year, value.month, value.day)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(str(value).strip(), fmt)
        except ValueError:
            pass
    raise ValueError("Cannot read date %r (use YYYY-MM-DD)" % value)


def load_news():
    folder = os.path.join(CONTENT, "news")
    posts = []
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".md") or name.startswith(("_", ".")):
            continue
        meta, body = read_markdown_file(os.path.join(folder, name))
        if meta.get("draft"):
            continue
        try:
            date = to_datetime(meta.get("date") or name[:10])
        except ValueError as e:
            sys.exit("%s: %s" % (name, e))
        slug = meta.get("slug") or re.sub(r"^\d{4}-\d{2}-\d{2}-", "", name[:-3])
        posts.append({
            "title": meta.get("title", slug),
            "date": date,
            "slug": slug,
            "image": meta.get("image"),  # shown at the top of the post and on its card
            "thumb": meta.get("image") or first_image(body),  # card picture
            "image_fit": meta.get("image_fit", "cover"),
            "image_caption": meta.get("image_caption"),
            "url": "/%04d/%02d/%02d/%s/" % (date.year, date.month, date.day, slug),
            "body": markdown(body),
            "summary": meta.get("summary") or summarize(body),
        })
    posts.sort(key=lambda p: p["date"], reverse=True)
    return posts


def first_image(md_text):
    m = re.search(r"!\[[^\]]*\]\(([^)\s]+)", md_text)
    if m:
        return m.group(1)
    m = re.search(r"\{\{<\s*youtube\s+([\w-]+)\s*>\}\}", md_text)
    if m and os.path.exists(os.path.join(STATIC, "uploads", "yt", m.group(1) + ".jpg")):
        return "/uploads/yt/%s.jpg" % m.group(1)
    return None


def group_by(items, key):
    groups = OrderedDict()
    for item in items:
        groups.setdefault(key(item), []).append(item)
    return list(groups.items())


def year_of(text):
    m = re.search(r"\b(19|20)\d{2}\b", str(text or ""))
    return m.group(0) if m else "Other"


# --------------------------------------------------------------------------- template helpers


def fmt_date(value, style="long"):
    d = to_datetime(value)
    if style == "short":
        return d.strftime("%b %Y")
    return "%d %s" % (d.day, d.strftime("%B %Y"))


def cv_split(line):
    """'2021-2026, Associate Professor, UvA' -> ('2021–2026', 'Associate Professor, UvA')"""
    m = re.match(r"^\s*(\d{4}\s*(?:-\s*\d{4})?\s*-?)\s*,\s*(.*)$", line)
    if not m:
        return "", line
    years = re.sub(r"\s+", "", m.group(1)).replace("-", "–")
    return years, m.group(2)


def make_env():
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(TEMPLATES),
        autoescape=jinja2.select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["md"] = lambda s: Markup(markdown(s or ""))
    env.filters["mdi"] = lambda s: Markup(markdown_inline(s or ""))
    env.filters["date"] = fmt_date
    env.filters["cv_split"] = cv_split
    env.filters["year_of"] = year_of
    return env


# --------------------------------------------------------------------------- build


A_TAG = re.compile(r"<a\b([^>]*)>", re.I)
HREF_ATTR = re.compile(r'\bhref\s*=\s*"([^"]*)"', re.I)
REL_ATTR = re.compile(r'\brel\s*=\s*"([^"]*)"', re.I)


def own_hosts(site):
    host = re.sub(r"^https?://", "", site.get("url", "")).split("/")[0].lower()
    bare = host[4:] if host.startswith("www.") else host
    return {bare, "www." + bare} if bare else set()


def external_links_in_new_tab(text, hosts):
    """Make every link to another website open in a new tab (target="_blank", rel="noopener")."""
    def fix(m):
        attrs = m.group(1)
        href = HREF_ATTR.search(attrs)
        if not href or re.search(r"\btarget\s*=", attrs, re.I):
            return m.group(0)
        url = html.unescape(href.group(1)).strip()
        if not re.match(r"(https?:)?//", url, re.I):
            return m.group(0)                      # internal page, #anchor, mailto:, tel:
        host = re.split(r"[/?#:]", re.sub(r"^(https?:)?//", "", url, flags=re.I), 1)[0].lower()
        if host in hosts:
            return m.group(0)
        rel = REL_ATTR.search(attrs)
        if rel:
            words = rel.group(1).split()
            if "noopener" not in words:
                words.append("noopener")
            attrs = attrs[:rel.start()] + 'rel="%s"' % " ".join(words) + attrs[rel.end():]
        else:
            attrs += ' rel="noopener"'
        return '<a%s target="_blank">' % attrs
    return A_TAG.sub(fix, text)


def write(target, path, text):
    path = os.path.join(target, path.lstrip("/"))
    if path.endswith("/"):
        path += "index.html"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def build():
    start = time.time()
    site = load_yaml(os.path.join(CONTENT, "site.yaml"))
    data = {os.path.splitext(n)[0]: load_yaml(os.path.join(DATA, n))
            for n in sorted(os.listdir(DATA)) if n.endswith((".yaml", ".yml"))}
    news = load_news()
    about_meta, about_body = read_markdown_file(os.path.join(CONTENT, "pages", "about.md"))

    # Build into a temporary folder, then swap it in, so a half-finished build is never served.
    tmp = "%s.tmp-%d" % (OUT, os.getpid())
    shutil.rmtree(tmp, ignore_errors=True)
    shutil.copytree(STATIC, tmp)

    env = make_env()
    common = {
        "site": site,
        "data": data,
        "news": news,
        "year": datetime.date.today().year,
        "version": int(start),
    }

    hosts = own_hosts(site)

    def render(url, template, section="", title="", **extra):
        ctx = dict(common, url=url, section=section, page_title=title, description=None, og_image=None)
        ctx.update(extra)
        page = env.get_template(template).render(**ctx)
        write(tmp, url, external_links_in_new_tab(page, hosts))

    # publications are numbered automatically, newest = highest number
    pubs = data["publications"]["publications"]
    for i, entry in enumerate(pubs):
        entry["n"] = len(pubs) - i

    # homepage, research list, posts
    render("/", "home.html", section="home", pubs_recent=pubs[:6], about_html=Markup(markdown(about_body)))
    render("/research/", "research.html", section="research", title="Research highlights",
           years=group_by(news, lambda p: p["date"].year))
    for i, post in enumerate(news):
        render(post["url"], "post.html", section="research", title=post["title"], post=post,
               newer=news[i - 1] if i > 0 else None, older=news[i + 1] if i + 1 < len(news) else None,
               description=post["summary"], og_image=post["thumb"])

    # pages
    extras = {
        "about.html": {"about": about_meta, "about_body": Markup(markdown(about_body))},
        "publications.html": {"pub_years": group_by(pubs, lambda p: p["year"])},
        "awards.html": {"award_years": group_by(data["awards"], lambda a: year_of(a["date"]))},
        "press.html": {"press_years": group_by(data["press"], lambda a: year_of(a.get("date") or a.get("url")))},
    }
    for url, template, section, title in PAGES:
        render(url, template, section=section, title=title, **extras.get(template, {}))
    render("/404.html", "404.html", title="Page not found")

    # feeds
    write(tmp, "/feed.xml", rss(site, news[:20]))
    urls = ["/", "/research/"] + [p[0] for p in PAGES] + [p["url"] for p in news]
    write(tmp, "/sitemap.xml", sitemap(site, urls))

    old = "%s.old-%d" % (OUT, os.getpid())
    if os.path.isdir(OUT):
        os.rename(OUT, old)
    os.rename(tmp, OUT)
    shutil.rmtree(old, ignore_errors=True)
    print("Built %d pages in %.1fs -> %s" % (len(urls) + 1, time.time() - start, os.path.relpath(OUT)))


def rss(site, posts):
    base = site["url"].rstrip("/")
    items = "".join(
        "<item><title>%s</title><link>%s%s</link><guid>%s%s</guid><pubDate>%s</pubDate>"
        "<description>%s</description></item>" % (
            xml_escape(p["title"]), base, p["url"], base, p["url"],
            p["date"].strftime("%a, %d %b %Y %H:%M:%S +0000"), xml_escape(p["summary"]))
        for p in posts)
    return ('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>%s</title>'
            '<link>%s/</link><description>%s</description>%s</channel></rss>' % (
                xml_escape(site["title"]), base, xml_escape(site["description"]), items))


def sitemap(site, urls):
    base = site["url"].rstrip("/")
    body = "".join("<url><loc>%s%s</loc></url>" % (base, u) for u in urls)
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">%s</urlset>' % body)


# --------------------------------------------------------------------------- preview server


def snapshot():
    state = {}
    for folder in (CONTENT, DATA, TEMPLATES, STATIC):
        for dirpath, _, files in os.walk(folder):
            for f in files:
                p = os.path.join(dirpath, f)
                try:
                    state[p] = os.path.getmtime(p)
                except OSError:
                    pass
    return state


def watch():
    last = snapshot()
    while True:
        time.sleep(1)
        now = snapshot()
        if now != last:
            last = now
            try:
                build()
            except Exception as e:  # keep serving; show the error
                print("BUILD ERROR:", e)


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_error(self, code, message=None, explain=None):
        page = os.path.join(OUT, "404.html")
        if code == 404 and os.path.exists(page):
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            with open(page, "rb") as f:
                self.wfile.write(f.read())
        else:
            super().send_error(code, message, explain)

    def log_message(self, *args):
        pass


def serve(port=8000):
    build()
    threading.Thread(target=watch, daemon=True).start()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=OUT))
    print("Preview: http://localhost:%d   (edits rebuild automatically, Ctrl+C to stop)" % port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        serve(int(sys.argv[2]) if len(sys.argv) > 2 else 8000)
    else:
        build()
