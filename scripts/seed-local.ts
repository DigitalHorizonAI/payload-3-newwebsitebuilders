/**
 * Local-only demo content. Run with:
 *
 *   pnpm payload run ./scripts/seed-local.ts
 *
 * The production database has no articles yet, so there is nothing to look at
 * while working on the blog's design. This fills a LOCAL database with a few
 * published posts, cover images and nav items, and clears the boilerplate's
 * own demo articles.
 *
 * It WRITES and DELETES, so it refuses to run unless DATABASE_URI is local.
 * Never point it at Railway.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import os from 'os'

const text = (t: string) => ({
  type: 'text',
  text: t,
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  version: 1,
})

const para = (t: string) => ({
  type: 'paragraph',
  children: [text(t)],
  direction: 'ltr',
  format: '',
  indent: 0,
  textFormat: 0,
  version: 1,
})

const heading = (t: string) => ({
  type: 'heading',
  tag: 'h2',
  children: [text(t)],
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
})

const body = (paragraphs: (string | { heading: string })[]) => ({
  root: {
    type: 'root',
    children: paragraphs.map((p) => (typeof p === 'string' ? para(p) : heading(p.heading))),
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
})

/** A soft brand-coloured gradient, so cards have something in the image slot. */
const coverImage = async (name: string, from: string, to: string) => {
  const file = path.join(os.tmpdir(), `${name}.png`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="1600" height="1000" fill="url(#g)"/>
  </svg>`
  await sharp(Buffer.from(svg)).png().toFile(file)
  return file
}

const POSTS = [
  {
    title: 'What a voice agent actually books',
    slug: 'what-a-voice-agent-actually-books',
    description:
      'A booking agent is only useful if the calendar fills. Here is what we measure, and what we ignore.',
    colours: ['#5c9cff', '#1a1a1a'],
    content: [
      'A voice agent that answers every call is easy. A voice agent that turns those calls into appointments people actually keep is a different problem.',
      { heading: 'Measure the booking, not the conversation' },
      'Call length, sentiment scores and transcript quality all look good in a dashboard. None of them pay for the system. The number that matters is confirmed appointments per hundred answered calls.',
      'Everything else is diagnostics for when that number moves the wrong way.',
    ],
  },
  {
    title: 'Automations that survive contact with a real business',
    slug: 'automations-that-survive-real-business',
    description:
      'Most automations break the first time reality disagrees with the happy path. A few habits that keep them running.',
    colours: ['#ffb35c', '#5c9cff'],
    content: [
      'The demo always works. The second week is where automations quietly fall over: a renamed column, a customer who answers a question with a question, an API that starts rate limiting at lunchtime.',
      { heading: 'Design for the boring failure' },
      'Assume every external call fails sometimes. Log what went in, log what came back, and make the failure visible to a human rather than silent.',
      'An automation that stops and says so is worth more than one that keeps going and is wrong.',
    ],
  },
  {
    title: 'Where AI belongs in a small team',
    slug: 'where-ai-belongs-in-a-small-team',
    description:
      'Not everywhere. The wins come from the repetitive edges of the work, not the middle of it.',
    colours: ['#1a1a1a', '#4c4c4c'],
    content: [
      'Small teams do not have a spare person to run a new tool. So the question is never "what could AI do here" but "what is already eating hours that nobody wants to spend".',
      { heading: 'Start at the edges' },
      'Intake, scheduling, follow-up, first-line questions. Repetitive, well-defined, and forgiving of a handover to a human when something unusual turns up.',
      'The middle of the work — judgement, relationships, pricing — stays with the people who own the outcome.',
    ],
  },
  {
    title: 'The intake call is the product',
    slug: 'the-intake-call-is-the-product',
    description: 'Everything downstream depends on the first thirty seconds.',
    colours: ['#ffb35c', '#5c9cff'],
    content: [
      'By the time a lead reaches a proposal, the outcome is mostly decided. What was captured on the first call decides whether the rest of the process has anything to work with.',
      { heading: 'Capture, then qualify' },
      'Get the details down before deciding whether the lead is worth pursuing. A half-recorded call that turns out to matter cannot be recovered.',
      'The agent that asks one more question is cheaper than the follow-up email that never gets answered.',
    ],
  },
  {
    title: 'Choosing what not to automate',
    slug: 'choosing-what-not-to-automate',
    description: 'The judgement calls and the apology stay with people.',
    colours: ['#eef3f8', '#5c9cff'],
    content: [
      'Every automation project has a list of things that could be automated. The useful work is deciding which of them should not be.',
      { heading: 'Two things to leave alone' },
      'Anything where being wrong is expensive and hard to reverse, and anything where the point of the interaction is that a person was involved.',
      'An apology delivered by a bot is worse than no apology at all.',
    ],
  },
]

const seed = async () => {
  const payload = await getPayload({ config })

  if (!process.env.DATABASE_URI?.includes('localhost')) {
    throw new Error('Refusing to seed: DATABASE_URI is not a local database.')
  }

  // The local database still carries the boilerplate's own demo articles
  // ("Getting Started with Payload CMS Website Template" and friends). Drop
  // anything that isn't one of ours so the listing shows Digital Horizon only.
  const ours = POSTS.map((p) => p.slug)
  const strays = await payload.find({
    collection: 'posts',
    limit: 100,
    where: { slug: { not_in: ours } },
  })
  for (const stray of strays.docs) {
    await payload.delete({
      collection: 'posts',
      id: stray.id,
      context: { disableRevalidate: true },
    })
    payload.logger.info(`removed boilerplate post ${stray.slug}`)
  }

  const email = 'demo@digital-horizon.io'
  const existingUser = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
  })

  const author =
    existingUser.docs[0] ??
    (await payload.create({
      collection: 'users',
      // Local seed data: this account is the one a developer signs in with, so
      // it needs to be able to manage accounts and keys as well as content.
      data: { email, password: 'demo1234', name: 'Digital Horizon', role: 'admin' },
    }))

  const categoryTitles = ['Voice agents', 'Automation', 'Practice']
  const categories: { id: number }[] = []
  for (const title of categoryTitles) {
    const found = await payload.find({ collection: 'categories', where: { title: { equals: title } } })
    categories.push(found.docs[0] ?? (await payload.create({ collection: 'categories', data: { title } })))
  }

  for (const [i, post] of POSTS.entries()) {
    const existing = await payload.find({ collection: 'posts', where: { slug: { equals: post.slug } } })
    if (existing.docs.length) {
      payload.logger.info(`skipping ${post.slug}, already seeded`)
      continue
    }

    const filePath = await coverImage(post.slug, post.colours[0], post.colours[1])
    const media = await payload.create({
      collection: 'media',
      data: { alt: post.title },
      filePath,
    })
    fs.unlinkSync(filePath)

    await payload.create({
      collection: 'posts',
      context: { disableRevalidate: true },
      data: {
        title: post.title,
        slug: post.slug,
        _status: 'published',
        publishedAt: new Date(Date.now() - i * 86400000 * 3).toISOString(),
        authors: [author.id],
        categories: [categories[i % categories.length].id],
        content: body(post.content) as never,
        meta: { title: post.title, description: post.description, image: media.id },
      },
    })
    payload.logger.info(`seeded ${post.slug}`)
  }

  await payload.updateGlobal({
    slug: 'header',
    context: { disableRevalidate: true },
    data: {
      navItems: [
        { link: { type: 'custom', label: 'Blog', url: '/blog' } },
        { link: { type: 'custom', label: 'Services', url: 'https://digital-horizon.io/#services' } },
      ],
    },
  })

  await payload.updateGlobal({
    slug: 'footer',
    context: { disableRevalidate: true },
    data: {
      navItems: [
        { link: { type: 'custom', label: 'Blog', url: '/blog' } },
        { link: { type: 'custom', label: 'Contact', url: 'https://digital-horizon.io/contact' } },
      ],
    },
  })

  payload.logger.info('done')
  process.exit(0)
}

await seed()
