# Publishing articles over the API

For an external tool that writes articles into the **NewWebsite.builders** blog.

⚠️ This file started as a copy of the Digital Horizon one and was corrected on
14 Aug 2026. Every host below is NewWebsite.builders's. If you find a
`digital-horizon.io` reference anywhere in it, that is a leftover and articles
sent there land in the wrong CMS.

## Authentication

Every request carries the key in an `Authorization` header. The prefix is the
collection name and is part of the format:

```
Authorization: apiClients API-Key <key>
```

Base URL: `https://cms.newwebsite.builders`

A key that is disabled or revoked returns `403`. Keys are not currently
reachable from `newwebsite.builders` — use the CMS host directly.

## What a key may do

| | |
| --- | --- |
| Create articles | yes, including publishing them straight to the live blog |
| Update articles | yes |
| Delete articles | yes |
| Read drafts as well as published articles | yes |
| Upload, replace and delete images | yes |
| Create, rename and delete categories | yes |
| Read unpublished **pages** (the marketing site) | **no** — blog only |
| Read or create users, or issue further keys | **no** |
| Sign in to the admin panel | **no** — a key has no login |

A key manages the blog and nothing else. It is deliberately not an
administrator account: it cannot see who the administrators are, cannot create
one, and cannot issue further keys, so a leaked key costs you the blog's
contents and not the site.

Deleting is permanent. To take an article off the site while keeping it,
update it to `"_status": "draft"` instead — it disappears from the blog and the
sitemap and can be published again later.

## The two things worth knowing before you start

**1. `content` is Lexical JSON, not HTML or markdown.** It is required, and a
plain string is rejected. This is the part most likely to cost a day: the tool
needs a converter from whatever it authors in. The minimum accepted document:

```json
{
  "root": {
    "type": "root", "format": "", "indent": 0, "version": 1, "direction": "ltr",
    "children": [
      {
        "type": "paragraph", "format": "", "indent": 0, "version": 1,
        "direction": "ltr", "textFormat": 0,
        "children": [
          { "type": "text", "detail": 0, "format": 0, "mode": "normal",
            "style": "", "text": "First paragraph.", "version": 1 }
        ]
      }
    ]
  }
}
```

Payload publishes `@payloadcms/richtext-lexical` helpers for converting HTML
and markdown into this shape; using them is easier than hand-building it.

**2. `_status` must be `"published"` or nothing goes live.** Drafts are on for
this collection, so an article created without it is saved but invisible, and
it will not appear on the site or in the sitemap.

## Creating an article

```http
POST /api/posts
Authorization: apiClients API-Key <key>
Content-Type: application/json

{
  "title": "What to measure when a voice agent answers your calls",
  "_status": "published",
  "content": { "root": { ... } }
}
```

`slug` derives from `title` automatically; send one only to override it.
Optional: `meta.title`, `meta.description`, `meta.image`, `categories`,
`publishedAt`, `relatedPosts`, `byline`.

`byline` is a plain text field and is how an article gets an author name. Do
**not** send `authors` — that is a relationship to the user accounts, and a key
cannot read them.

Response is `201` with the created document. Take `doc.id` from it if the
article needs updating later.

## Categories

`categories` takes an array of category ids, not names. To use one that does
not exist yet, create it first:

```http
POST /api/categories
Authorization: apiClients API-Key <key>
Content-Type: application/json

{ "title": "Voice agents" }
```

`title` is the only field. Take `doc.id` from the `201` and pass it in the
article's `categories` array. Existing categories are readable without a key at
`GET /api/categories`, so a tool can look one up before creating a duplicate —
nothing stops two categories sharing a title.

## Uploading a cover image

```http
POST /api/media
Authorization: apiClients API-Key <key>
Content-Type: multipart/form-data
```

Send the binary as `file`, and a JSON string as `_payload` carrying the other
fields, e.g. `{"alt":"Description of the image"}`.

Note the shape: the non-file fields travel as one JSON string under `_payload`,
not as ordinary form fields. `alt` is not enforced by the API, but send it
anyway — it is the image's description for screen readers and for Google, and
an image without one is a small accessibility and SEO regression on every
article that uses it.

Use the returned `doc.id` as `meta.image` when creating the article.

## Where an article appears

Once published it is live at `https://newwebsite.builders/blog/<slug>`, listed
on `/blog`, and included in `https://newwebsite.builders/blog-sitemap.xml`.

One delay is normal and is not a fault: the public site fetches from the CMS
with a short cache, so a change can take **around five minutes** to appear on
`newwebsite.builders/blog` even though it is immediate in the CMS. When checking
whether something worked, read it back from `cms.newwebsite.builders` first —
that separates "it did not publish" from "the cache has not caught up".

The sitemap updates as soon as an article is published, unpublished, renamed or
deleted, so it needs no waiting.

## Issuing and revoking keys (admin)

In the admin panel: **Settings → Api Clients → Create**. Fill in the tool name
and an owner to contact, and tick **Enable API Key** — the value is generated
at that point. Save, then reveal it with the eye icon and copy it. Unlike a
password it stays readable there afterwards, so it can be retrieved later.

To revoke, untick Enable API Key or delete the record. Either takes effect
immediately.

Note for anyone scripting this: Payload does not generate the key value
server-side. The admin panel generates it in the browser. Over REST you supply
`apiKey` yourself and Payload derives its lookup index from what you send.

## If something is rejected

- `403` — the key is disabled, revoked, or the operation is not one a key may
  perform. See the table above.
- `400` with `"The following field is invalid: Content > Content"` — `content`
  is missing or is not Lexical JSON.
- Article created but not visible — `_status` was not `"published"`.
