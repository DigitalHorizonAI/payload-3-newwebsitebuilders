// In-text pictures in the article API's contentHtml: Lexical `upload` nodes, which
// Payload leaves as bare media ids at any depth.
// Run: node --test tests/article-html-uploads.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

// A namespace import, so a missing export fails its own tests instead of the whole file.
import * as A from '../src/lib/articleHtml.ts'

const ORIGIN = 'https://cms.example.test'

const media = (id, extra = {}) => ({
  id,
  url: `/api/media/file/p${id}.webp`,
  alt: `Picture ${id}`,
  mimeType: 'image/webp',
  width: 1408,
  height: 768,
  sizes: {
    thumbnail: { url: `/api/media/file/p${id}-300x164.webp`, width: 300 },
    square: { url: `/api/media/file/p${id}-500x500.webp`, width: 500 },
    small: { url: `/api/media/file/p${id}-600x327.webp`, width: 600 },
    medium: { url: `/api/media/file/p${id}-900x491.webp`, width: 900 },
    large: { url: `/api/media/file/p${id}-1400x764.webp`, width: 1400 },
    xlarge: { url: null, width: null },
  },
  ...extra,
})
const para = (text) => ({ type: 'paragraph', children: [{ type: 'text', text }] })
const upload = (value) => ({ type: 'upload', relationTo: 'media', value, fields: null })
const body = (...children) => ({ root: { children } })
const between = (picture) => body(para('one'), upload(picture), para('two'))
const render = (content, docs, opts = {}) =>
  A.articleHtml(content, { resolveMedia: A.mediaResolver(docs, ORIGIN), ...opts })

test('a bare id renders as a picture at its place between the paragraphs', async () => {
  const html = await render(between(548), [media(548)])
  const f = `${ORIGIN}/api/media/file/p548`
  assert.equal(
    html,
    '<p>one</p>\n\n' +
      `<figure><img src="${f}.webp" srcset="${f}-600x327.webp 600w, ${f}-900x491.webp 900w, ` +
      `${f}-1400x764.webp 1400w, ${f}.webp 1408w" sizes="(max-width: 720px) 100vw, 720px" ` +
      'alt="Picture 548" width="1408" height="768" loading="lazy" decoding="async" /></figure>\n\n' +
      '<p>two</p>',
  )
})

test('a populated media doc renders without being looked up', async () => {
  const html = await render(between(media(7)), [])
  assert.match(html, /<img src="https:\/\/cms\.example\.test\/api\/media\/file\/p7\.webp"/)
})

test('deleted media (no doc for the id) renders nothing and does not throw', async () => {
  assert.equal(await render(between(999), [media(548)]), '<p>one</p>\n\n<p>two</p>')
})

test('media without alt gets an empty alt', async () => {
  const html = await render(between(1), [media(1, { alt: null })])
  assert.match(html, / alt="" /)
})

test('alt text is escaped', async () => {
  const html = await render(between(1), [media(1, { alt: 'A "big" <b> & co' })])
  assert.match(html, / alt="A &quot;big&quot; &lt;b&gt; &amp; co" /)
})

test('a non-image upload renders nothing', async () => {
  const pdf = media(2, { mimeType: 'application/pdf', url: '/api/media/file/a.pdf', sizes: {} })
  assert.equal(await render(between(2), [pdf]), '<p>one</p>\n\n<p>two</p>')
})

test('only this CMS or https may serve the picture', async () => {
  for (const url of [
    'javascript:alert(1)',
    'http://elsewhere.test/a.webp',
    'data:image/png;base64,AAAA',
  ]) {
    const doc = media(3, { url, sizes: {} })
    assert.equal(await render(between(3), [doc]), '<p>one</p>\n\n<p>two</p>', url)
  }
  const https = await render(between(4), [
    media(4, { url: 'https://files.example.test/a.webp', sizes: {} }),
  ])
  assert.match(
    https,
    /<img src="https:\/\/files\.example\.test\/a\.webp" alt="Picture 4" width="1408"/,
  )
  // http on this CMS's own origin is fine (a local build).
  const local = await A.articleHtml(between(5), {
    resolveMedia: A.mediaResolver([media(5, { sizes: {} })], 'http://127.0.0.1:3000'),
  })
  assert.match(local, /<img src="http:\/\/127\.0\.0\.1:3000\/api\/media\/file\/p5\.webp"/)
})

test('a variant on a foreign http host is left out of srcset, not the picture', async () => {
  const doc = media(6)
  doc.sizes.medium = { url: 'http://elsewhere.test/m.webp', width: 900 }
  const html = await render(between(6), [doc])
  assert.doesNotMatch(html, /elsewhere/)
  assert.match(html, / 600w, \S+ 1400w, /)
})

test('bareMediaIds lists each unpopulated picture once, for one media read', () => {
  const content = body(
    upload(548),
    para('x'),
    upload(media(9)),
    upload(548),
    { type: 'block', fields: { blockType: 'mediaBlock', media: 550 } },
    upload('551'),
  )
  assert.deepEqual(A.bareMediaIds(content), [548, 550, '551'])
  assert.deepEqual(A.bareMediaIds(null), [])
})

test('the lenient endpoint mode renders nothing for a picture it cannot resolve', async () => {
  assert.equal(await A.articleHtml(between(548)), '<p>one</p>\n\n<p>two</p>')
})

test('strict mode (the importers) refuses to drop a picture silently', async () => {
  await assert.rejects(A.articleHtml(between(548), { strict: true }), /upload/)
  await assert.rejects(render(between(999), [], { strict: true }), /999/)
})
