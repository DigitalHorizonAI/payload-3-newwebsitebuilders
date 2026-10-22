// Drives formatSlugHook with the args Payload's update/create operations pass it.
// Run: node --test tests/format-slug.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatSlugHook } from '../src/fields/slug/formatSlug.ts'

const hook = formatSlugHook('title')
const run = (args) => hook(args)

const esTitle = 'Por qué las webs codificadas a mano cargan más rápido que los constructores'
const saved = { slug: 'codigo-a-mano-versus-constructores-de-paginas', slugLock: true }

test('locked update keeps the saved slug when the admin sends one made from the title', () => {
  const value = 'por-qu-las-webs-codificadas-a-mano-cargan-m-s-r-pido-que-los-constructores'
  const out = run({
    operation: 'update',
    data: { title: esTitle, slug: value, slugLock: true },
    originalDoc: saved,
    value,
  })
  assert.equal(out, saved.slug)
})

test('locked update keeps the saved slug when a title arrives without a slug', () => {
  // Payload fills an omitted field's value from the saved doc before the hook runs.
  const out = run({ operation: 'update', data: { title: esTitle }, originalDoc: saved, value: saved.slug })
  assert.equal(out, saved.slug)
})

test('unlocked update takes the new slug', () => {
  const out = run({
    operation: 'update',
    data: { title: esTitle, slug: 'Nueva Direccion', slugLock: false },
    originalDoc: saved,
    value: 'Nueva Direccion',
  })
  assert.equal(out, 'nueva-direccion')
})

test('a doc already unlocked takes the new slug when the save omits slugLock', () => {
  const out = run({
    operation: 'update',
    data: { slug: 'nueva-direccion' },
    originalDoc: { ...saved, slugLock: false },
    value: 'nueva-direccion',
  })
  assert.equal(out, 'nueva-direccion')
})

test('a locale with no slug yet still gets one from its title', () => {
  const out = run({
    operation: 'update',
    data: { title: 'Hola Mundo', slugLock: true },
    originalDoc: { slug: undefined, slugLock: true },
    value: undefined,
  })
  assert.equal(out, 'hola-mundo')
})

test('create makes the slug from the title', () => {
  const out = run({ operation: 'create', data: { title: 'Hola Mundo' }, originalDoc: undefined, value: undefined })
  assert.equal(out, 'hola-mundo')
})

test('a saved slug read with locale=all (an object) is never returned as the slug', () => {
  const out = run({
    operation: 'update',
    data: { slug: 'nueva', slugLock: true },
    originalDoc: { slug: { en: 'a', es: 'b' }, slugLock: true },
    value: 'nueva',
  })
  assert.equal(out, 'nueva')
})
