# -*- coding: utf-8 -*-
"""
Dump the blog's source of truth out of the front-end repo as JSON.

blog/_build/content.py IS the blog's content today: POSTS plus the HTML body
fragments beside it. Reading it directly beats scraping the rendered pages -
the bodies are byte-identical to what the builder was given, with none of the
ids and whitespace build.py adds on the way out.

Read-only. Imports the module and prints; touches nothing in that repo.
"""
import json
import os
import sys

BUILD_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'newwebsitebuilders', 'blog', '_build')
)

if not os.path.isdir(BUILD_DIR):
    sys.exit('front-end repo not found at %s' % BUILD_DIR)

sys.path.insert(0, BUILD_DIR)
import content as C  # noqa: E402

out = []
for post in C.POSTS:
    entry = {
        'id': post['id'],
        'topic': post['topic'],
        'art': post.get('art'),
        'published': post['published'],
        'langs': {},
    }
    for lang, data in post['langs'].items():
        entry['langs'][lang] = {
            'slug': data['slug'],
            'title': data['title'],
            'h1': data.get('h1'),
            'excerpt': data.get('excerpt'),
            'description': data.get('description'),
            'keywords': data.get('keywords'),
            'body': data['body'],
            # The public path the article already has, without /blog - the
            # convention the legacyPath field documents.
            'legacyPath': '%s/%s.html' % (lang, data['slug']),
        }
    out.append(entry)

# ensure_ascii stays at its default. This prints to stdout and the caller
# redirects it to a file, so the bytes are written in the shell's encoding, not
# ours - on Windows that is cp1252, which turned all 54 accents in the Dutch
# articles into single high bytes that Node then read as U+FFFD. ASCII escapes
# make the file immune to whatever the shell decides to do.
print(json.dumps({'langs': C.LANGS, 'topics': C.TOPICS, 'author': C.AUTHOR, 'posts': out}, indent=2))
